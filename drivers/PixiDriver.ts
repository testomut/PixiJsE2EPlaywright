import { expect, type Page } from "@playwright/test";
import type { GamePhase, GameSnapshot, PixiObjectBounds } from "../types/pixiTestBridge.js";
import { describeAppState } from "../utils/diagnostics.js";

const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * Canvas/Pixi interaction mechanics: waiting for the test bridge, resolving
 * an object's real bounds into a browser click, and polling game phase.
 * Knows nothing about expected win amounts, balances, or other business
 * outcomes - that belongs to GamePage and the assertions/scenarios layer.
 */
export class PixiDriver {
  constructor(private readonly page: Page) {}

  async waitUntilReady(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    await this.page.waitForFunction(
      () => typeof window.__TEST_APP__ !== "undefined" && window.__TEST_APP__.isReady(),
      undefined,
      { timeout: timeoutMs },
    );
  }

  /**
   * Resolves a Pixi object's global bounds and validates them: finite,
   * and within the canvas. Throws with the requested label and current
   * app state when the object can't be used.
   */
  async getObjectBounds(label: string): Promise<PixiObjectBounds> {
    const canvasLocator = this.page.locator("canvas");
    const canvasCount = await canvasLocator.count();
    if (canvasCount === 0) {
      throw new Error(
        `Cannot resolve bounds for "${label}": no <canvas> element is attached to the page.`,
      );
    }

    // getObjectBounds() returns render-space bounds (canvas.width/height
    // pixel space), not CSS pixels - validate against the canvas's actual
    // render resolution, not its (possibly CSS-scaled) bounding rect.
    const canvasSize = await canvasLocator.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
    }));

    const bounds = await this.page.evaluate(
      (objectLabel) => window.__TEST_APP__.getObjectBounds(objectLabel),
      label,
    );

    if (!bounds) {
      const diagnostics = await describeAppState(this.page);
      throw new Error(`Pixi object "${label}" was not found on the stage.\n${diagnostics}`);
    }

    const values = [bounds.x, bounds.y, bounds.width, bounds.height];
    if (!values.every(Number.isFinite)) {
      throw new Error(
        `Pixi object "${label}" returned non-finite bounds: ${JSON.stringify(bounds)}`,
      );
    }

    if (
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.x + bounds.width > canvasSize.width ||
      bounds.y + bounds.height > canvasSize.height
    ) {
      throw new Error(
        `Pixi object "${label}" bounds fall outside the canvas render size ` +
          `(${canvasSize.width}x${canvasSize.height}, bounds ${JSON.stringify(bounds)}).`,
      );
    }

    return bounds;
  }

  /**
   * Clicks the center of a Pixi object's global bounds, converted to
   * browser coordinates via the canvas's bounding rect. The bridge returns
   * render-space bounds; converting them to browser coordinates is this
   * driver's responsibility, not the application's.
   */
  async clickObject(label: string): Promise<void> {
    const bounds = await this.getObjectBounds(label);

    if (!bounds.visible || !bounds.renderable) {
      throw new Error(`Pixi object "${label}" is not visible/renderable and cannot be clicked.`);
    }

    const canvasBox = await this.page.locator("canvas").boundingBox();
    if (!canvasBox) {
      throw new Error(`Cannot click "${label}": no <canvas> element is attached to the page.`);
    }

    // Scale accounts for the canvas being displayed at a different CSS size
    // than its internal render resolution (responsive layouts, DPR scaling).
    const canvasSize = await this.page.locator("canvas").evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
    }));
    const scaleX = canvasSize.width > 0 ? canvasBox.width / canvasSize.width : 1;
    const scaleY = canvasSize.height > 0 ? canvasBox.height / canvasSize.height : 1;

    const clickX = canvasBox.x + (bounds.x + bounds.width / 2) * scaleX;
    const clickY = canvasBox.y + (bounds.y + bounds.height / 2) * scaleY;
    await this.page.mouse.click(clickX, clickY);
  }

  async getGameSnapshot(): Promise<GameSnapshot> {
    return this.page.evaluate(() => window.__TEST_APP__.getGameSnapshot());
  }

  /** Polls the game phase using Playwright's own retrying assertion, not a fixed wait. */
  async waitForPhase(phase: GamePhase, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
    try {
      await expect
        .poll(() => this.getGameSnapshot().then((snapshot) => snapshot.phase), {
          timeout: timeoutMs,
        })
        .toBe(phase);
    } catch (error) {
      const diagnostics = await describeAppState(this.page);
      throw new Error(`Timed out waiting for phase "${phase}".\n${diagnostics}`, {
        cause: error,
      });
    }
  }
}
