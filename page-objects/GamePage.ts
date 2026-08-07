import type { Page, Response } from "@playwright/test";
import { PixiDriver } from "../drivers/PixiDriver.js";
import type { GamePhase, GameSnapshot } from "../types/pixiTestBridge.js";
import type { SpinApiResponse } from "../data/gameTestData.js";

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
   * Overrides the /api/game/spin response for the rest of this test, so
   * scenarios don't depend on the server's real random outcome.
   */
  async mockNextSpin(response: SpinApiResponse): Promise<void> {
    await this.page.route("**/api/game/spin", (route) => {
      route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(response.body ?? { error: "mocked failure" }),
      });
    });
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
