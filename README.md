# Pixi.js E2E Automation — Playwright

A small, strongly typed Playwright test-automation project for the Pixi.js/Canvas demo game in
[testomut/pixijs-e2e-testing-demo](https://github.com/testomut/pixijs-e2e-testing-demo). This
repository contains **only** the Playwright automation — no application source, no Cypress. Tests
read as business scenarios; every Canvas/Pixi mechanic and every assertion is hidden behind a
small, deliberately narrow API.

**Application repository:** https://github.com/testomut/pixijs-e2e-testing-demo
**Live demo:** https://pixijs-e2e-testing-demo.vercel.app (see [Limitations](#limitations) — CI
does not test the deployed build)

This project is part of a Pixi.js E2E testing series:

1. [Why Canvas and Pixi.js Applications Are Hard to Test in E2E](https://medium.com/@testdream66/why-canvas-and-pixi-js-applications-are-hard-to-test-in-e2e-b95474640633)
2. [How Pixi.js Works Inside Canvas and Why It Matters for QA Automation](https://medium.com/@testdream66/how-pixi-js-works-inside-canvas-and-why-it-matters-for-qa-automation-a85c6ed59dac)

---

## Why normal DOM locators can't target Pixi objects

The game is a small slot-style demo rendered entirely inside a single `<canvas>` element. Once the
player starts the game, everything — the Spin button, balance, reels, result text — is drawn
pixels on that canvas. `page.getByRole(...)`, `page.getByText(...)`, and CSS selectors all return
nothing for it, because there's no DOM node to find. The only way to interact with it reliably is
through structured information the application chooses to expose (`window.__TEST_APP__`), and a
real pointer click at the right screen coordinates.

## Architecture

```
spec (e2e/game.spec.ts)
  ↓
fixture (game.fixture.ts)
  ↓
GamePage           — user-facing flow, DOM interaction, and business assertions
  ↓
PixiController     — Canvas/Pixi mechanics: bounds, coordinate conversion, phase polling
  ↓
window.__TEST_APP__  — read-only observability bridge (owned by the application repo)
  ↓
Pixi.js application
```

```
e2e/game.spec.ts        every scenario - business-level method calls only
fixtures/game.fixture.ts player, game, startedGame
pages/GamePage.ts        user-facing flow + all assertions (verify*)
support/PixiController.ts  the only Pixi/Canvas-specific code in this project
types/game.types.ts      GamePhase, SpinResult, Player, GameSnapshot
types/pixi.types.ts      PixiObjectLabel, PixiObjectBounds, TestBridge
playwright.config.ts
```

This is intentionally flatter than an earlier version of this project, which had separate
`assertions/`, `drivers/`, `data/`, and `utils/` layers. Those responsibilities didn't disappear —
they moved: assertions into `GamePage`'s `verify*` methods, driver mechanics into
`PixiController`, the handful of mocked spin responses into a small typed constant inside
`GamePage.ts`, and diagnostics into a private `PixiController` method. Nothing was deleted without
being kept somewhere; see [Scenarios](#scenarios) for exactly what still exists.

## Fixtures

```ts
type Fixtures = {
  player: Player; // { nickname: string }
  game: GamePage; // app opened, game NOT started
  startedGame: GamePage; // game fixture + nickname entered + started + ready
};
```

- **`player`** creates a fresh `{ nickname: "player_<timestamp>" }` per test. The uniqueness is for
  session isolation (each test gets its own `?session=` query param, so balance/state never leaks
  between tests) — not for randomizing any outcome.
- **`game`** opens the application but does **not** start it. This exists specifically for tests
  that validate the start/onboarding flow itself — calling `start()`/`waitUntilReady()` from
  inside the fixture would make that flow untestable.
- **`startedGame`** depends on `game` and `player`: it enters the nickname, starts the game, and
  waits until the Pixi scene reports ready, then hands the same `GamePage` to the test. It does
  nothing beyond that — no mocking, no spinning, no unrelated setup.

## Why tests contain only business methods

`e2e/game.spec.ts` never calls `page.click`, `page.locator`, `page.mouse`, `page.route`, `expect`,
or `window.__TEST_APP__` directly. A test reads as a scenario:

```ts
test("player completes a winning spin", async ({ startedGame }) => {
  await startedGame.setNextSpinResult("win");
  await startedGame.spin();
  await startedGame.verifyResult("win");
});
```

The reasoning: a spec file is the one artifact non-automation stakeholders might actually read. If
it's full of coordinate math, route handlers, and raw `expect()` calls, it stops being readable as
a description of behavior. Every technical concern - how a click is computed, how a response is
mocked, what "won" actually means in terms of phase/balance/result/displayed text - has exactly
one home (`PixiController` or `GamePage`), so it's defined once and reused, not copy-pasted across
specs.

## Why assertions live inside GamePage, not the spec

`GamePage.verifyResult()`, `verifyApiError()`, etc. call Playwright's native `expect` internally.
There's no separate `GameAssertions` class and no generic wrappers like
`verifyVisible()`/`verifyEquals()` — each method expresses one specific business outcome (phase +
result + displayed text + balance checked together, not one implementation detail at a time).
`expect(await startedGame.getResult()).toBe('win')` in the spec would leak the _shape_ of a "win"
back into the test; `await startedGame.verifyResult('win')` doesn't.

## PixiController and coordinate conversion

`PixiController` is the **only** Pixi/Canvas-specific code in this project:

```ts
class PixiController {
  async waitUntilReady(): Promise<void>;
  async click(label: PixiObjectLabel): Promise<void>;
  async getBounds(label: PixiObjectLabel): Promise<PixiObjectBounds>;
  async getSnapshot(): Promise<GameSnapshot>;
  async waitForPhase(phase: GamePhase): Promise<void>;
  async waitWhilePhase(phase: GamePhase): Promise<void>; // resolves once phase is no longer `phase`
}
```

`getObjectBounds()` returns bounds in **render space** (`canvas.width`/`canvas.height` pixel
space, already resolved for anchor/pivot/scale/nested transforms by the application's own Pixi
`getBounds()` call). `getBounds()` validates those bounds against the canvas's actual render
resolution - **not** its CSS bounding rect, which can differ under CSS scaling or a different
device pixel ratio. `click()` then converts to a real browser click:

```ts
const rect = canvas.getBoundingClientRect();
const scaleX = rect.width / canvas.width;
const scaleY = rect.height / canvas.height;

const renderX = bounds.x + bounds.width / 2;
const renderY = bounds.y + bounds.height / 2;

const browserX = rect.left + renderX * scaleX;
const browserY = rect.top + renderY * scaleY;

await page.mouse.click(browserX, browserY);
```

No magic coordinates anywhere - every click is computed from live bounds at the moment the test
runs. `verifyScaledCanvasInteraction()` proves this holds even when the canvas is displayed at
half its render resolution via CSS (see [CSS-scaling regression](#scenarios) below).

## Strong typing

`window.__TEST_APP__` is typed once, in `types/pixi.types.ts`, via a global `Window` interface
augmentation - no `as any` casts scattered through the code:

```ts
interface TestBridge {
  isReady(): boolean;
  getObjectBounds(label: string): PixiObjectBounds | null;
  getGameSnapshot(): GameSnapshot;
}

declare global {
  interface Window {
    __TEST_APP__?: TestBridge;
  }
}
```

`types/game.types.ts` holds the business/domain model (`GamePhase`, `SpinResult`, `GameResult`,
`Player`, `GameSnapshot`); `types/pixi.types.ts` holds Pixi/Canvas-specific concepts
(`PixiObjectLabel`, `PixiObjectBounds`) plus the bridge contract itself. `GameSnapshot` keeps the
real `betAmount` and full `{win, amount, symbols}` `lastResult` shape (rather than collapsing it to
a bare `'win' | 'loss'`) because exact balance-arithmetic verification is real, existing coverage -
`GameResult` (`'win' | 'loss'`) exists separately as `verifyResult()`'s parameter type, not as a
replacement for `lastResult`. `GameSnapshot.resultText` mirrors the application's own addition of
the same field - the literal string shown in the result label, confirmed by reading `GameApp.ts`
directly rather than guessed.

## Deterministic mocking

```ts
await startedGame.setNextSpinResult("win"); // | "loss" | "error"
```

Internally, `GamePage.setNextSpinResult()` intercepts `/api/game/spin` with `page.route()` and a
fixed, typed response body - the same mechanism a test would use against any real backend. There's
no `Math.random()` patching and no `forceWin()`-style shortcut on the bridge.

**This is deliberately a true one-shot mock.** `page.route()` does not replace a previously
registered handler for the same pattern - each call stacks a new one, and only the most recently
registered handler runs (confirmed directly: an "older" handler that isn't superseded is still
reachable via `route.fallback()`). The handler here unroutes itself immediately after fulfilling -
fulfill first, then unroute, since unrouting first makes Playwright auto-resolve the route and the
subsequent `fulfill()` throws `"Route is already handled!"`. That makes `setNextSpinResult()`
apply to exactly one request no matter how many times it's called in a test, rather than leaving
every prior handler registered and merely shadowed.

## State synchronization

No `waitForTimeout()`, no manual `sleep()`, no arbitrary delays. Tests rely on:

- Playwright's built-in auto-waiting for DOM actions;
- `page.waitForResponse()` for a real (unmocked) network round trip;
- `expect.poll()` inside `PixiController.waitForPhase()` to observe the bridge's
  `GameSnapshot.phase`;
- `page.waitForFunction()` to wait for the bridge to attach and report ready.

The spec never knows any of this is happening - it just calls `spin()` and `verifyResult()`.
`spin()` owns the complete lifecycle of one spin as a single user action: it clicks, then proves
the animation genuinely started (`PixiController.waitForPhase("spinning")`) before waiting for it
to genuinely finish (`PixiController.waitWhilePhase("spinning")` - the symmetric "wait until no
longer this phase" counterpart, since a spin can settle into either `"result"` or `"error"`). If
the application ever skipped straight from `"ready"` to a final state, `spin()` would time out and
fail - confirmed directly: an earlier version of this method that hardcoded a wait for `"result"`
specifically did exactly that when applied to a mocked API error, because **the real error path
has no animation step at all** (no `spinAnimate()` call in `GameApp.ts`'s catch block, unlike the
~2.4s reel animation on success) - the mocked fetch can resolve faster than a single bridge
round-trip can observe "spinning" at all. That's why triggering an error uses `attemptSpin()`
instead - a plain click with no animation assertion, since there's no real animation to prove.

## Scenarios

10 tests, all under one `test.describe("Pixi.js game", ...)` in `e2e/game.spec.ts`:

**Business flow** — a player can start the game (nickname reaches the bridge, phase reaches
`ready`); the Spin button resolves via its stable Pixi label with valid, visible, renderable
bounds; a winning spin and a losing spin each let `spin()` prove the full animation lifecycle
(genuinely reaches `"spinning"`, genuinely leaves it) before `verifyResult()` checks the settled
phase + structured result + **displayed result text** + exact balance arithmetic; a failed spin
(triggered via `attemptSpin()`, since the real error path has no animation to prove) refunds the
bet, shows the real error text, and the game is genuinely spinnable again immediately afterward
(proven by completing a real subsequent win, not just checking the error went away); a repeated
click while already spinning doesn't deduct the bet twice.

**Technical regressions** — real coverage that doesn't read naturally as business behavior, using
equally meaningful method names rather than forced business language: an unknown Pixi object
throws a diagnosable error (requested label, canvas internal/CSS dimensions, current phase, known
labels - never the whole Pixi stage); the Spin button remains clickable when the canvas is
CSS-scaled to half its render resolution; the Spin button's bounds stay stable across a full spin
cycle; a real, unmocked request reaches `/api/game/spin` with the expected response shape.

One scenario from an earlier version of this project - a test proving DOM selectors can't find the
Spin button - was intentionally dropped rather than ported. It didn't verify application
correctness, only a structural fact about Canvas rendering that every other test already
demonstrates implicitly (they all interact through `PixiController`, never a DOM selector).

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

- **(A) Test the deployed Vercel demo.** Simplest to wire up, but ties every CI run to whatever
  happens to be currently deployed - which has lagged behind the application repo's `main` branch
  before. It also adds a real network dependency and couples this repo's CI to Vercel's uptime.
- **(B) Check out the application repository and start it locally.** Slightly more setup, but
  tests the actual current application source, deterministically, on every run.

**(B) was chosen.** `.github/workflows/e2e.yml` checks out `testomut/pixijs-e2e-testing-demo` into
`app/`, installs `app/demo-app`, starts it with `npm run dev` (the mocked `/api/game/spin`
endpoint is Vite dev-server middleware, not present in a `vite preview` static build), waits for
it to respond, then runs this repo's lint/format/typecheck/Playwright suite against it. `app/` is
excluded from this project's ESLint/Prettier/TypeScript configs, since it's the application repo's
own code, not this project's.

## Diagnostics

- **Screenshots** and **video** retained on failure, **trace** retained on failure
  (`retain-on-failure`, so a first-attempt local failure with 0 retries still gets a trace) - all
  uploaded as CI artifacts.
- `PixiController` errors include the requested label, canvas internal dimensions, canvas CSS
  dimensions, the current game phase, and the object bounds where available - never the whole Pixi
  stage.
- `npm run test:report` opens the HTML report locally after a run.

## Limitations

- This repository owns no application code - if the bridge shape or object labels change in
  `pixijs-e2e-testing-demo`, `types/pixi.types.ts` and `PixiController`'s known-label list here
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
