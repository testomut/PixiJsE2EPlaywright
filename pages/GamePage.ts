import { expect, type Page, type Route } from "@playwright/test";
import { PixiController } from "../support/PixiController.js";
import type { GameResult, ReelSymbols, SpinMockResult } from "../types/game.types.js";
import type { ButtonLabel, TextLabel, DisplayLabel } from "../types/pixi.types.js";

const SPIN_API_PATTERN = "**/api/game/spin";

// Deterministic response bodies for setNextSpinResult() - small and
// specific enough to live here rather than in a separate data module.
const SPIN_RESPONSES: Record<
  SpinMockResult,
  { status: number; body?: { win: boolean; amount: number; symbols: ReelSymbols } }
> = {
  win: { status: 200, body: { win: true, amount: 100, symbols: ["💎", "💎", "💎"] } },
  loss: { status: 200, body: { win: false, amount: 0, symbols: ["🍒", "🍋", "⭐"] } },
  error: { status: 500 },
};

// The exact copy GameApp.ts sets on its result label - confirmed by
// reading the application source, not guessed. WIN_TEXT is a function
// rather than a plain string because the real copy includes the won
// amount ("WIN! +$100") - a Record<GameResult, string> would have to
// hardcode one specific amount, which wouldn't be the real text for any
// other amount.
const WIN_TEXT = (amount: number) => `WIN! +$${amount}`;
const LOSS_TEXT = "No win - try again!";
const API_ERROR_TEXT = "Spin failed - please try again";

/**
 * User-facing game behavior: navigation, DOM interaction, starting the
 * game, spinning, deterministic response setup, and business assertions.
 * Delegates all Canvas/Pixi mechanics to PixiController - no coordinate
 * math or scene traversal happens here.
 */
export class GamePage {
  // DOM selectors
  public readonly nicknameInputSelector: string = "#player-name";
  public readonly startGameButtonSelector: string = "#start-btn";
  public readonly canvasSelector: string = "canvas";

  // Pixi buttons
  public readonly spinButton: ButtonLabel = "spinButton";
  public readonly betMinusButton: ButtonLabel = "betMinus";
  public readonly betPlusButton: ButtonLabel = "betPlus";

  // Pixi text elements
  public readonly balanceText: TextLabel = "balanceDisplay";
  public readonly stateText: TextLabel = "stateDisplay";
  public readonly resultText: TextLabel = "resultText";

  // Pixi display elements
  public readonly reelsDisplay: DisplayLabel = "reelsDisplay";

  private balanceBeforeSpin: number | null = null;

  constructor(
    private readonly page: Page,
    private readonly pixi: PixiController,
    private readonly sessionId?: string,
  ) {}

  async open(): Promise<void> {
    const url = this.sessionId ? `/?session=${encodeURIComponent(this.sessionId)}` : "/";
    await this.page.goto(url);
  }

  async start(nickname: string): Promise<void> {
    await this.page.locator(this.nicknameInputSelector).fill(nickname);
    await this.page.locator(this.startGameButtonSelector).click();
  }

  async waitUntilReady(): Promise<void> {
    await this.pixi.waitUntilReady();
  }

  /**
   * Overrides the response for exactly the next /api/game/spin request,
   * so scenarios don't depend on the server's real random outcome.
   * page.route() does not replace a previously registered handler for
   * the same pattern - each call stacks a new one, and the handler must
   * unroute itself (after fulfilling, not before - unrouting first makes
   * Playwright auto-resolve the route and the fulfill() call throws) so
   * this genuinely applies to exactly one request, however many times
   * it's called.
   */
  async setNextSpinResult(result: SpinMockResult): Promise<void> {
    const response = SPIN_RESPONSES[result];
    const handler = async (route: Route) => {
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        body: JSON.stringify(response.body ?? { error: "mocked failure" }),
      });
      await this.page.unroute(SPIN_API_PATTERN, handler);
    };
    await this.page.route(SPIN_API_PATTERN, handler);
  }

  /**
   * One complete user action: click, then prove the spin genuinely
   * animates - both the phase reaching "spinning" AND the reel symbols
   * actually changing (confirmed by inspecting the app: reelsDisplay
   * itself never moves, only its child texts' content does, so phase
   * alone can't prove a visual change happened) - before returning only
   * once the animation has genuinely finished (phase leaves "spinning").
   * Only valid for outcomes the real application actually animates - a
   * mocked API error resolves before "spinning" becomes observable at
   * all (confirmed by testing: the app's error path has no animation
   * step), so triggering an error uses spinExpectingError() instead.
   */
  async spin(): Promise<void> {
    this.balanceBeforeSpin = (await this.pixi.getSnapshot()).balance;
    const reelsBeforeClick = await this.pixi.getReelSymbols();

    await this.pixi.click(this.spinButton);
    await this.pixi.waitForPhase("spinning");
    await this.pixi.waitForReelChange(reelsBeforeClick);
    await this.pixi.waitWhilePhase("spinning");
  }

  /**
   * Clicks Spin without asserting an animation lifecycle. Exists
   * specifically for the mocked-API-error scenario, where the real
   * application has no observable "spinning" duration to prove - the
   * caller synchronizes on "error" directly instead (see verifyApiError()).
   */
  async spinExpectingError(): Promise<void> {
    this.balanceBeforeSpin = (await this.pixi.getSnapshot()).balance;
    await this.pixi.click(this.spinButton);
  }

  async verifyReady(): Promise<void> {
    const snapshot = await this.pixi.getSnapshot();
    expect(snapshot.phase).toBe("ready");
  }

  async verifyPlayer(nickname: string): Promise<void> {
    const snapshot = await this.pixi.getSnapshot();
    expect(snapshot.playerName).toBe(nickname);
  }

  async verifySpinButtonIsInteractable(): Promise<void> {
    const bounds = await this.pixi.getBounds(this.spinButton);
    expect(bounds.visible).toBe(true);
    expect(bounds.renderable).toBe(true);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  }

  /**
   * Checks the complete win/loss outcome: phase, the structured result,
   * the literal text shown to the player, and exact balance arithmetic -
   * not just one of those in isolation. Assumes spin() already completed
   * the full animation lifecycle; this only reads the settled snapshot.
   */
  async verifyResult(result: GameResult): Promise<void> {
    const snapshot = await this.pixi.getSnapshot();
    const balanceBefore = this.requireBalanceBeforeSpin();
    const expectedAmount = SPIN_RESPONSES[result].body?.amount ?? 0;

    expect(snapshot.phase).toBe("result");
    expect(
      snapshot.lastResult?.win,
      `expected ${result}, got ${JSON.stringify(snapshot.lastResult)}`,
    ).toBe(result === "win");

    const resultText = await this.pixi.getText(this.resultText);
    expect(resultText).toBe(result === "win" ? WIN_TEXT(expectedAmount) : LOSS_TEXT);

    expect(snapshot.balance).toBe(
      balanceBefore - snapshot.betAmount + (snapshot.lastResult?.amount ?? 0),
    );
  }

  async verifyApiError(): Promise<void> {
    await this.pixi.waitForPhase("error");
    const snapshot = await this.pixi.getSnapshot();
    const balanceBefore = this.requireBalanceBeforeSpin();

    // The spin never completed server-side, so the bet must be refunded -
    // not left deducted with no result to show for it.
    expect(snapshot.balance).toBe(balanceBefore);

    const resultText = await this.pixi.getText(this.resultText);
    expect(resultText).toBe(API_ERROR_TEXT);
  }

  /** A click that lands while already spinning must not deduct the bet twice. */
  async verifyRepeatedSpinIsIgnored(): Promise<void> {
    const before = await this.pixi.getSnapshot();
    await this.pixi.click(this.spinButton);
    await this.pixi.waitForPhase("spinning");

    // The button's eventMode is "none" while spinning, so Pixi won't
    // route this click to the spin handler - if it somehow did, the bet
    // would be deducted twice.
    await this.pixi.click(this.spinButton);

    await this.pixi.waitForPhase("ready");
    const after = await this.pixi.getSnapshot();
    expect(after.balance).toBe(before.balance - before.betAmount);
  }

  /** A real (unmocked) request must reach the API with the expected shape. */
  async verifyRealNetworkRequestSucceeds(): Promise<void> {
    const responsePromise = this.page.waitForResponse((res) =>
      res.url().includes("/api/game/spin"),
    );
    await this.pixi.click(this.spinButton);
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("win");
    expect(body).toHaveProperty("amount");
    expect(body.symbols).toHaveLength(3);
  }

  /** The Spin button's bounds must not drift across a full spin cycle. */
  async verifyButtonPositionStableAcrossSpin(): Promise<void> {
    const before = await this.pixi.getBounds(this.spinButton);
    await this.spin();
    const after = await this.pixi.getBounds(this.spinButton);
    expect(after).toEqual(before);
  }

  /**
   * Bounds validation, coordinate conversion, the real click, and the
   * complete animation lifecycle must all still hold once the canvas is
   * CSS-scaled to a different size than its render resolution.
   */
  async verifyScaledCanvasInteraction(): Promise<void> {
    await this.page.locator(this.canvasSelector).evaluate((el: HTMLCanvasElement) => {
      el.style.width = `${el.width / 2}px`;
      el.style.height = `${el.height / 2}px`;
    });

    const bounds = await this.pixi.getBounds(this.spinButton);
    expect(bounds.width).toBeGreaterThan(0);

    await this.spin();
  }

  /** An unknown Pixi object must fail with a useful, non-generic error. */
  async verifyUnknownObjectDiagnostics(): Promise<void> {
    await expect(this.pixi.getObjectBoundsByRuntimeLabel("thisObjectDoesNotExist")).rejects.toThrow(
      /thisObjectDoesNotExist" was not found on the stage/,
    );
  }

  private requireBalanceBeforeSpin(): number {
    if (this.balanceBeforeSpin === null) {
      throw new Error(
        "No balance recorded before this spin - verifyResult/verifyApiError must be called after spin()/spinExpectingError().",
      );
    }
    return this.balanceBeforeSpin;
  }
}
