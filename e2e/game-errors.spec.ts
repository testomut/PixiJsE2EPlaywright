import { test, expect } from "../fixtures/game.fixture.js";
import {
  uniquePlayerName,
  winningSpinResponse,
  spinServerErrorResponse,
} from "../data/gameTestData.js";

test.describe("Error handling", () => {
  test("the game recovers from a failed spin and can spin again", async ({
    gamePage,
    gameAssertions,
  }) => {
    await gamePage.mockNextSpin(spinServerErrorResponse);
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    const { balance: balanceBeforeFailure } = await gamePage.getSnapshot();
    await gamePage.spin();
    await gameAssertions.expectRecoveredFromError(balanceBeforeFailure);

    // A fresh mocked response proves the game is genuinely usable again,
    // not just reporting "error" while still stuck.
    await gamePage.mockNextSpin(winningSpinResponse);
    const { balance: balanceBeforeRetry } = await gamePage.getSnapshot();
    await gamePage.spin();
    await gameAssertions.expectWinningResult(balanceBeforeRetry, winningSpinResponse.body!.amount);
  });

  test("the driver throws a useful error for an unknown Pixi object", async ({ gamePage }) => {
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    await expect(gamePage.pixi.getObjectBounds("thisObjectDoesNotExist")).rejects.toThrow(
      /thisObjectDoesNotExist" was not found on the stage/,
    );
  });
});
