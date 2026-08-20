---
name: demo-screenshots
description: Capture the published screenshots — a matching light/dark pair of Transactions and of Recap — from the throwaway demo stack, and leave the machine clean. Use when the README's images are stale, when a surface they show has been redesigned, or when a new surface is worth publishing.
---

# Capturing the published screenshots

Four files live in `docs/screenshots/`, and the README swaps between them on the
reader's colour scheme:

| | light | dark |
| --- | --- | --- |
| Transactions | `transactions-light.webp` | `transactions-dark.webp` |
| Recap | `recap-light.webp` | `recap-dark.webp` |

They are taken from the **demo stack** (`docker-compose.demo.yml`, issue #141) —
a throwaway copy of the app over the seeded demo database, whose every
counterparty, amount and account number is invented. Nothing here ever points a
browser at a developer's own state, and nothing here needs a credential.

## Prerequisites

- **docker**, for the stack. `bun run demo:up` builds two images and publishes
  the app on <http://localhost:5400/app/>.
- **Chrome or Chromium** on the machine doing the capture. The capture script
  finds it at the usual names on `PATH` and the macOS bundle path; override with
  `CHROME=/path/to/chrome`. Nothing is installed for this — no driver library,
  no browser download. In a container, also set `CHROME_NO_SANDBOX=1`.
- **A UI sans-serif the system resolves.** The app names no font of its own, so
  it renders in `system-ui` — SF on macOS. A bare Linux box with only DejaVu
  installed produces legible but visibly different frames; install Inter (or
  another system-ui-alike) there before publishing what it takes.
- **Port 5400 free.** It is this stack's registered row
  (`packages/shared/src/ports.ts`), chosen so the stack can come up while
  `bun dev` is running.

## The procedure

Run it from the repo root. The teardown is a `trap`, not the last line of a
chain, so it runs whether the capture succeeded, failed or was interrupted —
which is what keeps a failed run from leaving containers, a volume and two
images behind:

```sh
trap 'bun run demo:down' EXIT INT TERM

bun run demo:up --detach     # builds, seeds, serves http://localhost:5400/app/
bun run demo:shots           # writes the four files into docs/screenshots/
```

`demo:up` runs the seeder as a one-shot container and holds the API back until
it has exited 0, so the app is never serving an empty database. Without
`--detach` it stays in the foreground and its summary — 3 accounts, 22 issuers,
175 transactions — is the confirmation that there is something to photograph;
run the capture from a second terminal in that case, and remember the `trap`
belongs in the shell that owns the stack.

Then look at the four files before committing them. The capture verifies
everything a machine can (below); whether the app looks *good* is the one thing
it cannot check.

## What the capture enforces, and why

Each of these has silently ruined a capture before, so each is code rather than
a habit — `capture.ts` and `shots.ts` beside this file, with
`packages/web/src/test/demo-screenshots.test.ts` holding the pure half of it.

- **The viewport is pinned over the debug protocol**, and re-pinned after every
  navigation. A maximized window ignores a resize and `--window-size` is a hint
  the window manager may round; `Emulation.setDeviceMetricsOverride` is neither,
  and a cross-document load can drop it.
- **The capture viewport decides legibility, not the output width.** The app is
  laid out at 1440×900 — a laptop window, which is how it is used — and the
  pixels are bought with a device scale factor of 2. Shooting at the output
  width gives a cramped app; shooting at 2560 lays the app out for a monitor and
  the downscaled result is unreadable in a README column.
- **The state is verified immediately before each shot**, never assumed and
  never slept on. The script waits for the app's own signals — nothing
  `aria-busy`, no `role="alert"`, fonts settled, images decoded — and then for
  something each surface only shows once its data is in: rows in the table, a
  figure in both of Recap's breakdowns. The `role="alert"` clause is what stops
  a frame showing an error the demo stack's missing credentials caused.
- **A pair is compared before either half is written.** Both frames are taken
  into memory and their size, scroll offset and rendered text compared; a
  mismatch fails the run. Swapping two frames that disagree looks like a glitch
  to the reader, not like a theme.
- **The scheme is forced on the URL**, `?theme=light` / `?theme=dark` (issue
  #143), which writes the key `next-themes` reads — so it survives the reload
  between frames. The emulated OS preference is set to match, so a frame that
  fell back is still the scheme that was asked for.

## Failure modes

| What you see | What it is |
| --- | --- |
| `never reached the state worth photographing` | The stack is not serving the seeded data. Check the seed container exited 0, and open the URL by hand. |
| `page was: … Something went wrong` | The app threw. Read the browser console at that URL — it is a bug in the app, not in the capture. |
| `The … pair does not match` | Something differs between the two frames. The message names the field; a text divergence is usually data that moved under the capture. |
| `The page never stopped changing` | A surface that never settles — an animation, a poll, a virtualized list still measuring. |
| `No Chrome found` | Set `CHROME`. |
| `Chrome exited with …` | Usually the sandbox in a container: set `CHROME_NO_SANDBOX=1`. |
| Frames are the right size but the text is wrong | A font the capturing machine resolves differently. See the prerequisite. |

## Changing what is captured

`shots.ts` is the whole answer to *what* — surfaces, viewport, scale, quality,
output directory, and the pinned search params. Add a surface there and both the
capture and its test pick it up; a surface needs a `ready` expression that is
true only once its data is in, and Recap's pinned `period`/`year` is the model
for anything whose default depends on the day it is run (the demo dataset's six
months are fixed ones in 2026, so the current-month default is empty on any
clock past them).

The README's `<picture>` blocks name the files, and the test asserts both frames
of both pairs appear there.

## Leaving the machine clean

`bun run demo:down` removes the containers, the volume and the images this stack
built — base images it pulled are left alone. The capture owns nothing else: it
runs Chrome in a throwaway profile directory and deletes it on the way out, on
the happy path and the failing one alike. Nothing intermediate is written; the
four `.webp` files are the only output, and they are meant to be committed.
