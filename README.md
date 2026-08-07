# Pixi.js E2E Automation — Playwright

A dedicated Playwright test-automation project for the Pixi.js/Canvas demo game in
[testomut/pixijs-e2e-testing-demo](https://github.com/testomut/pixijs-e2e-testing-demo). This
repository contains **only** the Playwright automation — no application source, no Cypress. It's
the second entry in a two-repository split: this project proves a Canvas/Pixi application can be
tested reliably with a proper driver/page-object architecture, without owning any game code.

**Application repository:** https://github.com/testomut/pixijs-e2e-testing-demo
**Live demo:** https://pixijs-e2e-testing-demo.vercel.app (see [Limitations](#limitations) — this
CI does not test the deployed build)

This project is part of a Pixi.js E2E testing series:

1. [Why Canvas and Pixi.js Applications Are Hard to Test in E2E](https://medium.com/@testdream66/why-canvas-and-pixi-js-applications-are-hard-to-test-in-e2e-b95474640633)
2. [How Pixi.js Works Inside Canvas and Why It Matters for QA Automation](https://medium.com/@testdream66/how-pixi-js-works-inside-canvas-and-why-it-matters-for-qa-automation-a85c6ed59dac)

---

## Why normal DOM locators can't target Pixi objects

The game is a small slot-style demo rendered entirely inside a single `<canvas>` element. Once the
player starts the game, everything — the Spin button, balance, reels, result text — is drawn
pixels on that canvas. `page.getByRole(...)`, `page.getByText(...)`, and CSS selectors all return
nothing for it, because there's no DOM node to find. The only way to interact with it reliably is
through structured information the application chooses to expose, and a real pointer click at the
right screen coordinates.

## Architecture

```
spec
  ↓
fixture (game.fixture.ts)
  ↓
GamePage          — user-facing flow and DOM interaction
  ↓
PixiDriver        — Canvas/Pixi mechanics: bounds, coordinate conversion, phase polling
  ↓
window.__TEST_APP__  — read-only observability bridge (owned by the application repo)
  ↓
Pixi.js application
```

```
e2e/                     game-start.spec.ts, game-spin.spec.ts, game-errors.spec.ts
fixtures/game.fixture.ts fixture wiring: gamePage, pixiDriver, gameAssertions
page-objects/GamePage.ts user-facing flow (open, startGameFor, spin, mockNextSpin)
drivers/PixiDriver.ts    Canvas/Pixi mechanics (bounds, click, phase waits, diagnostics)
assertions/GameAssertions.ts  domain checks (winning/losing result, recovery, single spin)
data/gameTestData.ts     typed win/loss/error response fixtures
types/pixiTestBridge.ts  the bridge shape, mirrored from the application repo
utils/diagnostics.ts     known-label list + failure-diagnostics helper
playwright.config.ts
```

**Responsibility split**, deliberately narrow:

- **`GamePage`** owns the business-facing flow: opening the app, filling in the player name,
  clicking Start, triggering a spin, mocking the network. It never does coordinate math.
- **`PixiDriver`** owns Canvas/Pixi mechanics only: waiting for the bridge, resolving an object's
  bounds, converting them to a browser click, polling game phase, and producing diagnosable
  errors. It has no idea what a "winning result" or "expected balance" is.
- **`GameAssertions`** expresses meaningful domain outcomes (phase + result + balance together),
  not a thin wrapper around `expect()`.

## The test bridge

This repository does not define `window.__TEST_APP__` — it's owned and implemented by the
application repository. This project only mirrors its type (`types/pixiTestBridge.ts`) and treats
it strictly as **read-only observability**:

```ts
interface TestBridge {
  isReady(): boolean;
  getObjectBounds(label: string): PixiObjectBounds | null; // {x,y,width,height,visible,renderable}
  getGameSnapshot(): GameSnapshot; // {phase, playerName, balance, betAmount, lastResult}
}
```

No `stage`, no `renderer`, no whole `Application`, no `forceWin()`/`spin()`/mutable service. Every
user action in these tests happens through the real DOM (`#player-name`, `#start-btn`) or a real
canvas pointer click — never by calling an application method directly.

## Coordinate conversion

`getObjectBounds()` returns bounds in **render space** (`canvas.width`/`canvas.height` pixel
space), already resolved for anchor/pivot/scale/nested transforms by the application's own Pixi
`getBounds()` call. `PixiDriver` is responsible for two separate things:

1. **Validating** those bounds against the canvas's actual render resolution
   (`canvas.width`/`canvas.height`) — not its CSS bounding rect, which can differ under CSS
   scaling or a different device pixel ratio.
2. **Converting** to a browser click by reading `canvas.getBoundingClientRect()` and scaling:
   ```ts
   scaleX = canvasRect.width / canvas.width;
   scaleY = canvasRect.height / canvas.height;
   clickX = canvasRect.x + (bounds.x + bounds.width / 2) * scaleX;
   clickY = canvasRect.y + (bounds.y + bounds.height / 2) * scaleY;
   ```

`the Spin button remains clickable when the canvas is CSS-scaled` (in `e2e/game-spin.spec.ts`)
proves this end to end: it shrinks the canvas to half its render resolution via
`el.style.width`/`height`, then confirms bounds validation, the click, and the resulting
spinning→result phase transition all still work.

## Deterministic mocking

Win, loss, and server-error scenarios are produced by intercepting `/api/game/spin` with
`page.route()` and fixed, typed response bodies (`data/gameTestData.ts`) — the same mechanism a
test would use against any real backend. There is no `Math.random()` patching and no
`forceWin()`-style shortcut.

## State synchronization

No `waitForTimeout()`, no manual `sleep()`, no arbitrary delays. Tests rely on:

- Playwright's built-in auto-waiting for DOM actions;
- `page.waitForResponse()` for the real network round trip;
- `expect.poll()` inside `PixiDriver.waitForPhase()` to observe the bridge's `GameSnapshot.phase`;
- `page.waitForFunction()` to wait for the bridge to attach and report ready.

## Scenarios (11 tests)

**game-start.spec.ts** — the Spin button isn't a DOM element; starting the game reaches `ready`
with the entered player name; the Spin button resolves via its stable Pixi label with valid,
visible, renderable bounds.

**game-spin.spec.ts** — deterministic win and loss (phase + result + balance checked together); a
real request hits `/api/game/spin`; a repeated click while spinning doesn't deduct the bet twice;
bounds stay stable across a spin cycle; the Spin button remains clickable when the canvas is
CSS-scaled to half its render resolution.

**game-errors.spec.ts** — a failed spin refunds the bet, moves to an `error` phase, and the game
can be spun again immediately afterward; an unknown Pixi object throws a diagnosable error
(requested label + current game snapshot + canvas geometry, not the whole Pixi stage).

## Running locally

**Prerequisites:** Node.js 22+, and a running instance of the application from
[pixijs-e2e-testing-demo](https://github.com/testomut/pixijs-e2e-testing-demo) (clone it
separately and run `npm run dev --prefix demo-app`, or point at any reachable instance).

```bash
npm ci
npm run lint
npm run format:check
npm run typecheck
npm test              # expects the app at http://localhost:3000 by default
```

Point tests at a different instance (e.g. a locally different port, or - for manual, non-CI
exploration only - the deployed demo) with:

```bash
APP_BASE_URL=https://pixijs-e2e-testing-demo.vercel.app npm test
```

## Commands

| Command                | What it does                                     |
| ---------------------- | ------------------------------------------------ |
| `npm run lint`         | ESLint                                           |
| `npm run format:check` | Prettier check                                   |
| `npm run typecheck`    | `tsc --noEmit`                                   |
| `npm test`             | Runs the Playwright suite against `APP_BASE_URL` |
| `npm run test:ui`      | Playwright's interactive UI mode                 |
| `npm run test:headed`  | Runs headed, for local debugging                 |
| `npm run test:report`  | Opens the last HTML report                       |

## CI: why a local checkout, not the deployed demo

Two options were considered for how CI reaches the application:

- **(A) Test the deployed Vercel demo.** Simplest to wire up (`baseURL` pointing at the live URL),
  but ties every CI run to whatever happens to be currently deployed - which may lag behind the
  application repo's `main` branch (confirmed to be the case at the time this project was built:
  the live deployment was running a pre-rework build of the bridge). It also adds a real network
  dependency and couples this repo's CI to Vercel's uptime and the app repo's deploy cadence,
  neither of which this repo controls.
- **(B) Check out the application repository and start it locally.** Slightly more setup (an
  extra `actions/checkout` step, installing `demo-app`'s dependencies, waiting for the dev server),
  but tests the actual current application source, deterministically, on every run - independent
  of deployment state or timing.

**(B) was chosen.** `.github/workflows/e2e.yml` checks out `testomut/pixijs-e2e-testing-demo` into
`app/`, installs `app/demo-app`, starts it with `npm run dev` (the mocked `/api/game/spin`
endpoint is Vite dev-server middleware, not present in a `vite preview` static build), waits for
it to respond, then runs this repo's lint/format/typecheck/Playwright suite against it.

## Diagnostics

- **Screenshots** on failure, **video** retained on failure, **trace** retained on failure
  (`retain-on-failure` rather than `on-first-retry`, so a first-attempt local failure with 0
  retries still gets a trace) - all uploaded as CI artifacts.
- `PixiDriver` errors include the requested label, the current `GameSnapshot`, and canvas geometry
  - never the whole Pixi stage.
- `npm run test:report` opens the HTML report locally after a run.

## Limitations

- This repository owns no application code - if the bridge shape or object labels change in
  `pixijs-e2e-testing-demo`, `types/pixiTestBridge.ts` and `utils/diagnostics.ts`'s label list here
  need to be updated by hand; nothing enforces that they stay in sync.
- CI always tests the application repository's current `main`, not a pinned version - a breaking
  change there can break this repo's CI without a corresponding change here.
- `workers: 1` in `playwright.config.ts`: several headless WebGL contexts competing for a software
  renderer under CI/sandbox constraints produced GPU-stall timeouts unrelated to test correctness,
  observed directly while building this suite.
- The CSS-scaling test covers CSS-size scaling specifically, not device-pixel-ratio scaling, since
  the application doesn't currently vary DPR.
- No Cypress equivalent exists in this repository by design - Cypress automation for this
  application is a separate, not-yet-created repository.

## License

MIT
