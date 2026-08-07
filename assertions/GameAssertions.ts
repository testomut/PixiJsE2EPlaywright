import { expect } from "@playwright/test";
import type { GamePage } from "../page-objects/GamePage.js";
import type { GameSnapshot } from "../types/pixiTestBridge.js";

/**
 * Domain-level checks that combine phase, result, and balance rather than
 * asserting on a single implementation detail. Not a generic wrapper
 * around expect() - each method here expresses one meaningful game outcome.
 */
export class GameAssertions {
  constructor(private readonly game: GamePage) {}

  async expectWinningResult(
    previousBalance: number,
    expectedWinAmount: number,
  ): Promise<GameSnapshot> {
    await this.game.waitForPhase("result");
    const snapshot = await this.game.getSnapshot();

    expect(
      snapshot.lastResult?.win,
      `expected a win, got ${JSON.stringify(snapshot.lastResult)}`,
    ).toBe(true);
    expect(snapshot.lastResult?.amount).toBe(expectedWinAmount);
    expect(snapshot.balance).toBe(previousBalance - snapshot.betAmount + expectedWinAmount);
    return snapshot;
  }

  async expectLosingResult(previousBalance: number): Promise<GameSnapshot> {
    await this.game.waitForPhase("result");
    const snapshot = await this.game.getSnapshot();

    expect(
      snapshot.lastResult?.win,
      `expected a loss, got ${JSON.stringify(snapshot.lastResult)}`,
    ).toBe(false);
    expect(snapshot.balance).toBe(previousBalance - snapshot.betAmount);
    return snapshot;
  }

  async expectRecoveredFromError(previousBalance: number): Promise<GameSnapshot> {
    await this.game.waitForPhase("error");
    const snapshot = await this.game.getSnapshot();

    // The spin never completed server-side, so the bet must be refunded -
    // not left deducted with no result to show for it.
    expect(snapshot.balance).toBe(previousBalance);
    return snapshot;
  }

  async expectSingleSpinDeduction(
    previousBalance: number,
    betAmount: number,
  ): Promise<GameSnapshot> {
    await this.game.waitForPhase("ready");
    const snapshot = await this.game.getSnapshot();

    // A second click that started a second spin would deduct the bet twice.
    expect(snapshot.balance).toBe(previousBalance - betAmount);
    return snapshot;
  }
}
