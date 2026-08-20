import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEMO_BASE_URL,
  DEVICE_SCALE_FACTOR,
  IMAGE_QUALITY,
  OUTPUT_DIR,
  READY_TIMEOUT_MS,
  type Shot,
  SHOTS,
  type Signature,
  shotUrl,
  signatureMismatch,
  SURFACES,
  THEMES,
  VIEWPORT,
} from "./shots";

/**
 * Capture the published screenshots (issue #144).
 *
 *     bun run demo:shots [--base-url=http://localhost:5400/app] [--out=docs/screenshots]
 *
 * It expects the app to be answering already — normally the demo stack, which
 * `SKILL.md` beside this file brings up and tears down around it. What it owns
 * is the browser: it starts one of its own in a throwaway profile, takes every
 * frame in {@link SHOTS}, and kills it on the way out whether or not the run
 * succeeded.
 *
 * Bootstrap, like `packages/api/scripts/seed-demo.ts`: no test drives this file.
 * What is testable was kept out of it — the shot list is `./shots.ts`, a module
 * of pure values that `packages/web/src/test/demo-screenshots.test.ts` asserts
 * along with the files this writes.
 *
 * It speaks CDP (the Chrome DevTools Protocol) to a Chrome it launched, over the
 * WebSocket Chrome prints on startup, and it does so by hand rather than through
 * a driver library. That is a deliberate trade: the repo gains no 300 MB
 * dependency and no browser download for a script that runs when a screenshot
 * needs retaking, and everything below is one WebSocket, one request/response
 * map and six protocol methods.
 *
 * The three rules it exists to enforce, each of which has silently ruined a
 * capture before:
 *
 * - **the viewport is pinned over the protocol**, not by sizing a window. A
 *   maximized window ignores a resize, and `--window-size` is a *hint* the
 *   window manager may round; `Emulation.setDeviceMetricsOverride` is not. It is
 *   re-applied after every navigation, because a cross-document load can drop
 *   the override and the next frame is then whatever size the window happens to
 *   be.
 * - **the state is verified immediately before the shutter**, never assumed. A
 *   fixed sleep is a bet on the machine; this waits for the app's own signals
 *   (nothing `aria-busy`, fonts settled, images decoded) and then for something
 *   the surface only shows once its data is in, so an empty view or a loading
 *   skeleton cannot be photographed.
 * - **a pair is compared before either half is written.** Both frames are taken
 *   into memory, their signatures compared ({@link signatureMismatch}), and only
 *   then do the files land. A pair that disagrees fails the run rather than
 *   shipping a light frame that does not line up with its dark twin.
 */

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);

const baseUrl = args.get("base-url") || DEMO_BASE_URL;
const outDir = args.get("out") || OUTPUT_DIR;

/**
 * Where Chrome is. `CHROME` wins, then the usual names on PATH and the macOS
 * bundle path — the same list a CI image and a laptop between them satisfy.
 */
function findChrome(): string {
  const explicit = args.get("chrome") || process.env.CHROME;
  if (explicit) return explicit;

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
  ];
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;

  throw new Error(
    "No Chrome found. Install Google Chrome or Chromium, or point CHROME at one:\n" +
      `  CHROME=/path/to/chrome bun run demo:shots\nLooked at:\n  ${candidates.join("\n  ")}`,
  );
}

/** One CDP connection, with a session attached to the page being captured. */
class Browser {
  private constructor(
    private readonly process: ChildProcess,
    private readonly socket: WebSocket,
    private readonly profileDir: string,
    private sessionId = "",
  ) {}

  private nextId = 0;
  private readonly pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (reason: Error) => void }
  >();

  static async launch(): Promise<Browser> {
    const profileDir = mkdtempSync(join(tmpdir(), "mamen-shots-"));
    const child = spawn(
      findChrome(),
      [
        // `--headless=new` is the real browser without a window: same renderer,
        // same fonts, same layout as what a reader would see.
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profileDir}`,
        // A fresh profile every run. `?theme=` writes to localStorage, so a
        // reused profile would carry the previous run's scheme into the first
        // frame of the next one, before the URL has a chance to force it.
        "--no-first-run",
        "--no-default-browser-check",
        // The scrollbar is the classic pair-breaker: it is drawn in the page's
        // own colours, so it differs between the two frames of a pair, and it
        // narrows the content by its own width only on the surface long enough
        // to need one.
        "--hide-scrollbars",
        "--force-color-profile=srgb",
        "--disable-gpu",
        // Containers and CI images generally cannot use the sandbox. Local
        // content only, and a browser that exists for the length of this run.
        ...(process.env.CHROME_NO_SANDBOX ? ["--no-sandbox"] : []),
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });

    const portFile = join(profileDir, "DevToolsActivePort");
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`Chrome exited with ${child.exitCode}:\n${stderr.trim()}`);
      }
      if (existsSync(portFile)) {
        const [port, path] = readFileSync(portFile, "utf8").split("\n");
        if (port && path) {
          const socket = await open(`ws://127.0.0.1:${port}${path}`);
          const browser = new Browser(child, socket, profileDir);
          browser.listen();
          return browser;
        }
      }
      await sleep(100);
    }
    child.kill("SIGKILL");
    throw new Error(`Chrome did not report a debugging port in 20s:\n${stderr.trim()}`);
  }

  /** Attach to a page target; every command after this runs in that page. */
  async openPage(): Promise<void> {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    this.sessionId = sessionId;
    await this.send("Page.enable");
  }

  send(method: string, params: Record<string, unknown> = {}, onBrowser = false): Promise<any> {
    const id = ++this.nextId;
    const message: Record<string, unknown> = { id, method, params };
    if (this.sessionId && !onBrowser && !method.startsWith("Target.")) {
      message.sessionId = this.sessionId;
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  /** Evaluate an expression in the page and return its value. */
  async evaluate<T>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(
        `Page threw evaluating ${expression}: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
      );
    }
    return result.value as T;
  }

  /** Route every reply back to the `send` that is waiting for it. */
  private listen(): void {
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (typeof message.id !== "number") return;

      const waiter = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (!waiter) return;
      if (message.error) {
        waiter.reject(new Error(`${message.error.message} (${message.error.code})`));
        return;
      }
      waiter.resolve(message.result);
    });
  }

  /** Always reached: the `finally` of the run, whatever happened inside it. */
  close(): void {
    try {
      this.socket.close();
    } catch {}
    this.process.kill("SIGKILL");
    rmSync(this.profileDir, { recursive: true, force: true });
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.addEventListener("open", () => resolve(socket), { once: true });
    socket.addEventListener("error", () => reject(new Error(`Cannot reach ${url}`)), {
      once: true,
    });
  });
}

/**
 * The app-wide part of "is this worth photographing", as one expression.
 *
 * `[aria-busy="true"]` is what every skeleton screen in the app sets
 * (`components/ui/skeleton.tsx`), so it covers a view whose data is still in
 * flight without this file knowing anything about the view. `[role="alert"]`
 * covers the other half of the acceptance criteria: a demo stack carries no
 * credential, and a frame showing what that broke is not a screenshot of the
 * app.
 */
const SETTLED = [
  "document.readyState === 'complete'",
  "!document.querySelector('[aria-busy=\"true\"]')",
  "!document.querySelector('[role=\"alert\"]')",
  "document.fonts.status === 'loaded'",
  "Array.from(document.images).every((image) => image.complete)",
].join(" && ");

const SIGNATURE = `({
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
  scrollX: Math.round(window.scrollX),
  scrollY: Math.round(window.scrollY),
  text: document.body.innerText.replace(/\\s+/g, ' ').trim(),
})`;

/** Take one frame, and the state it was taken in. */
async function capture(
  browser: Browser,
  shot: Shot,
): Promise<{ image: Buffer; signature: Signature }> {
  const url = shotUrl(baseUrl, shot);

  // The OS preference too, not only the app's switch: with `localStorage`
  // unavailable the app falls back to `prefers-color-scheme`, and a frame that
  // silently fell back should still be the scheme we asked for. Reduced motion
  // freezes the pulse on any placeholder and every framer-motion transition, so
  // the shutter is not racing an animation.
  await browser.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "prefers-color-scheme", value: shot.theme },
      { name: "prefers-reduced-motion", value: "reduce" },
    ],
  });

  await pinViewport(browser);
  await browser.send("Page.navigate", { url });
  // Again, after the load: a cross-document navigation can drop the override,
  // and the next frame would be taken at the window's own size.
  await pinViewport(browser);

  await waitFor(browser, `${SETTLED} && (${shot.surface.ready})`, url);

  // Both frames start from the top. Nothing scrolls these two views on load
  // today; this is what keeps that true for the pair rather than hoping.
  await browser.evaluate("window.scrollTo(0, 0)");
  await browser.evaluate(
    "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))",
  );

  const signature = await settle(browser);
  const { data } = await browser.send("Page.captureScreenshot", {
    format: "webp",
    quality: IMAGE_QUALITY,
    captureBeyondViewport: false,
    fromSurface: true,
  });

  return { image: Buffer.from(data, "base64"), signature };
}

/**
 * Read the signature until two consecutive readings agree, and return it.
 *
 * "Settled" is not the same as "finished laying out". The transactions table is
 * virtualized: which rows exist depends on a measured height, and the measure
 * lands a frame or two after the data does. Two readings of the same page a
 * moment apart therefore differ by a row — and if the pair straddles that
 * moment, the two frames disagree and the run fails on something that is not a
 * fault. Waiting for quiet is what makes the shutter reproducible.
 */
async function settle(browser: Browser): Promise<Signature> {
  let previous = await browser.evaluate<Signature>(SIGNATURE);

  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(250);
    const current = await browser.evaluate<Signature>(SIGNATURE);
    if (!signatureMismatch(previous, current)) return current;
    previous = current;
  }
  throw new Error("The page never stopped changing — nothing here is worth a screenshot.");
}

async function pinViewport(browser: Browser): Promise<void> {
  await browser.send("Emulation.setDeviceMetricsOverride", {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    mobile: false,
  });
}

/** Poll an expression until it is true, or say what the page was doing instead. */
async function waitFor(browser: Browser, expression: string, url: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (await browser.evaluate<boolean>(`!!(${expression})`)) return;
    await sleep(250);
  }

  const state = await browser.evaluate<string>(
    "document.readyState + ' | busy: ' + !!document.querySelector('[aria-busy=\"true\"]') +" +
      " ' | ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 200)",
  );
  throw new Error(
    `${url} never reached the state worth photographing in ${READY_TIMEOUT_MS / 1000}s.\n` +
      `  waiting for: ${expression}\n  page was: ${state}\n` +
      "  Is the API behind it serving the seeded demo database?",
  );
}

async function main(): Promise<void> {
  const browser = await Browser.launch();

  try {
    await browser.openPage();
    mkdirSync(outDir, { recursive: true });

    for (const surface of SURFACES) {
      const pair = SHOTS.filter((shot) => shot.surface.name === surface.name);
      const frames = [];

      for (const shot of pair) {
        console.log(`  ${shot.file} …`);
        frames.push({ shot, ...(await capture(browser, shot)) });
      }

      const [light, dark] = frames;
      const mismatch = signatureMismatch(light.signature, dark.signature);
      if (mismatch) {
        throw new Error(
          `The ${surface.name} pair does not match, so neither frame was written.\n  ${mismatch}\n` +
            "  Both frames must show the same page at the same size and offset — the README swaps\n" +
            "  between them on the reader's colour scheme.",
        );
      }

      for (const frame of frames) {
        const path = join(outDir, frame.shot.file);
        writeFileSync(path, frame.image);
        console.log(
          `  ${path} — ${VIEWPORT.width * DEVICE_SCALE_FACTOR}×${VIEWPORT.height * DEVICE_SCALE_FACTOR}, ${Math.round(frame.image.byteLength / 1024)} KB`,
        );
      }
    }
  } finally {
    browser.close();
  }

  console.log(`\n${SHOTS.length} frames, ${THEMES.length} schemes, ${SURFACES.length} surfaces.`);
}

main().catch((error: Error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
