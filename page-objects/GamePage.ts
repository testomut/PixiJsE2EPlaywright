import type { Page, Response, Route } from "@playwright/test";
import { PixiDriver } from "../drivers/PixiDriver.js";
import type { GamePhase, GameSnapshot } from "../types/pixiTestBridge.js";
import type { SpinApiResponse } from "../data/gameTestData.js";

const SPIN_API_PATTERN = "**/api/game/spin";

/**
 * The user-facing game flow: opening the app, entering a player name,
 * starting the game, and spinning. Delegates all Canvas/Pixi mechanics to
 * PixiDriver rather than doing coordinate math or scene traversal itself.
 */
export class GamePage {
  readonly pixi: PixiDriver;

  constructor(
    private readonly page: Page,
    private readonly sessionId?: string,
  ) {
    this.pixi = new PixiDriver(page);
  }

  async open(): Promise<void> {
    const url = this.sessionId ? `/?session=${encodeURIComponent(this.sessionId)}` : "/";
    await this.page.goto(url);
  }

  async startGameFor(playerName: string): Promise<void> {
    await this.page.locator("#player-name").fill(playerName);
    await this.page.locator("#start-btn").click();
    await this.pixi.waitUntilReady();
  }

  /**
   * Overrides the response for exactly the next /api/game/spin request, so
   * scenarios don't depend on the server's real random outcome.
   *
   * page.route() does not replace a previously registered handler for the
   * same pattern - each call stacks a new one, and only the most recently
   * registered handler runs (confirmed: an earlier handler that isn't
   * superseded remains reachable via route.fallback()). Since this handler
   * always fulfills, that stacking is invisible for a single mock, but
   * calling mockNextSpin() more than once per test would otherwise leave
   * every prior handler registered indefinitely. Unrouting this exact
   * handler as soon as it fires makes each call genuinely apply to one
   * request, regardless of how many times it's called.
   */
  async mockNextSpin(response: SpinApiResponse): Promise<void> {
    const handler = async (route: Route) => {
      // Unrouting before fulfilling causes Playwright to auto-resolve the
      // route first, making the subsequent fulfill() throw "Route is
      // already handled!" - fulfill, then unroute for future requests.
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(response.body ?? { error: "mocked failure" }),
      });
      await this.page.unroute(SPIN_API_PATTERN, handler);
    };
    await this.page.route(SPIN_API_PATTERN, handler);
  }

  async spin(): Promise<void> {
    await this.pixi.clickObject("spinButton");
  }

  /** Starts listening before the caller triggers the spin, so the response is never missed. */
  waitForSpinResponse(): Promise<Response> {
    return this.page.waitForResponse((res) => res.url().includes("/api/game/spin"));
  }

  async waitForPhase(phase: GamePhase): Promise<void> {
    await this.pixi.waitForPhase(phase);
  }

  async getSnapshot(): Promise<GameSnapshot> {
    return this.pixi.getGameSnapshot();
  }
}
