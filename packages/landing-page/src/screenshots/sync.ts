import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  frameFile,
  GENERATED_MODULE,
  overCeiling,
  readSourceScreenshots,
  renderGeneratedModule,
  SCHEMES,
  SHIPPED_DIR,
  SOURCE_DIR,
  totalBytes,
} from "./manifest";

/**
 * `bun run landing:screenshots` — put the README's screenshots on the landing
 * page (issue #149).
 *
 * The capture writes four files into `docs/screenshots/` and the README points
 * at them there. This copies them into `public/screenshots/`, where Vite lands
 * them in `dist` verbatim and nginx serves them, and writes the one module the
 * page reads about them. Run it after every capture; the pair of them is the
 * procedure in `.claude/skills/demo-screenshots/SKILL.md`.
 *
 * It **rewrites** the directory rather than adding to it, so a renamed or
 * dropped surface takes its frames with it — a stale copy still answers 200 to
 * whatever links at it, which is the failure that outlives a rename.
 *
 * It refuses to write over the weight ceiling. That is the one judgement call
 * in the pipeline: a bigger budget buys a more legible or a more complete
 * screenshot, and the trade is worth making on purpose, in a commit that says
 * so, rather than by whoever captures next (`manifest.ts`).
 */

const shots = readSourceScreenshots();

if (shots.length === 0) {
  console.error(`No screenshots in ${SOURCE_DIR} — capture them first (bun run demo:shots).`);
  process.exit(1);
}

const refusal = overCeiling(shots);
if (refusal !== null) {
  console.error(refusal);
  process.exit(1);
}

rmSync(SHIPPED_DIR, { recursive: true, force: true });
mkdirSync(SHIPPED_DIR, { recursive: true });

for (const shot of shots) {
  for (const scheme of SCHEMES) {
    const file = frameFile(shot.name, scheme);
    copyFileSync(`${SOURCE_DIR}${file}`, `${SHIPPED_DIR}${file}`);
  }
}

writeFileSync(GENERATED_MODULE, renderGeneratedModule(shots));

console.log(
  `Copied ${shots.length * SCHEMES.length} frames (${totalBytes(shots)} bytes): ` +
    `${shots.map((shot) => shot.name).join(", ")}.`,
);
