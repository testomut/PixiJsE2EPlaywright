import { test, expect } from "../fixtures/game.fixture.js";
import { uniquePlayerName, winningSpinResponse, losingSpinResponse } from "../data/gameTestData.js";

test.describe("Spinning", () => {
  test("a winning spin updates the balance", async ({ gamePage, gameAssertions }) => {
    await gamePage.mockNextSpin(winningSpinResponse);
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    const { balance: balanceBefore } = await gamePage.getSnapshot();
    await gamePage.spin();

    await gameAssertions.expectWinningResult(balanceBefore, winningSpinResponse.body!.amount);
  });

  test("a losing spin updates the balance", async ({ gamePage, gameAssertions }) => {
    await gamePage.mockNextSpin(losingSpinResponse);
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    const { balance: balanceBefore } = await gamePage.getSnapshot();
    await gamePage.spin();

    await gameAssertions.expectLosingResult(balanceBefore);
  });

  test("a real request is sent to /api/game/spin", async ({ gamePage }) => {
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    const responsePromise = gamePage.waitForSpinResponse();
    await gamePage.spin();
    const response = await responsePromise;

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("win");
    expect(body).toHaveProperty("amount");
    expect(body.symbols).toHaveLength(3);
  });

  test("a repeated click while spinning does not start a second spin", async ({
    gamePage,
    gameAssertions,
  }) => {
    await gamePage.mockNextSpin(losingSpinResponse);
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    const { balance: balanceBefore, betAmount } = await gamePage.getSnapshot();
    await gamePage.spin();
    await gamePage.waitForPhase("spinning");

    // The button's eventMode is set to "none" while spinning, so Pixi
    // itself won't route this click to the spin handler - if it somehow
    // did, the bet below would be deducted twice.
    await gamePage.spin();

    await gameAssertions.expectSingleSpinDeduction(balanceBefore, betAmount);
  });

  test("the Spin button's bounds stay consistent across a full spin cycle", async ({
    gamePage,
  }) => {
    await gamePage.mockNextSpin(losingSpinResponse);
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    const boundsBefore = await gamePage.pixi.getObjectBounds("spinButton");
    await gamePage.spin();
    await gamePage.waitForPhase("ready");
    const boundsAfter = await gamePage.pixi.getObjectBounds("spinButton");

    expect(boundsAfter).toEqual(boundsBefore);
  });

  test("the Spin button remains clickable when the canvas is CSS-scaled", async ({
    gamePage,
    page,
  }) => {
    await gamePage.mockNextSpin(losingSpinResponse);
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    // Display the canvas at half its internal render resolution via CSS,
    // independent of canvas.width/height - getObjectBounds() and
    // clickObject() must both still work in render space.
    await page.locator("canvas").evaluate((el: HTMLCanvasElement) => {
      el.style.width = `${el.width / 2}px`;
      el.style.height = `${el.height / 2}px`;
    });

    const bounds = await gamePage.pixi.getObjectBounds("spinButton");
    expect(bounds.width).toBeGreaterThan(0);

    await gamePage.spin();
    await gamePage.waitForPhase("spinning");
    await gamePage.waitForPhase("result");
  });
});
