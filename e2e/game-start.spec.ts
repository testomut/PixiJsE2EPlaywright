import { test, expect } from "../fixtures/game.fixture.js";
import { uniquePlayerName } from "../data/gameTestData.js";

test.describe("Starting the game", () => {
  test("the Spin button is drawn on canvas, not exposed as a DOM element", async ({
    page,
    gamePage,
  }) => {
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    // The lobby's own Start button is a real DOM element, so proving the
    // point requires checking for a *Spin*-named control specifically.
    await expect(page.getByRole("button", { name: "SPIN" })).toHaveCount(0);
    await expect(page.getByText("SPIN", { exact: true })).toHaveCount(0);
    await expect(page.locator("canvas")).toBeVisible();
  });

  test("player can enter a name and start the game", async ({ gamePage }) => {
    const playerName = uniquePlayerName();

    await gamePage.open();
    await gamePage.startGameFor(playerName);

    const snapshot = await gamePage.getSnapshot();
    expect(snapshot.phase).toBe("ready");
    expect(snapshot.playerName).toBe(playerName);
  });

  test("Spin button can be located semantically through the Pixi scene", async ({ gamePage }) => {
    await gamePage.open();
    await gamePage.startGameFor(uniquePlayerName());

    const bounds = await gamePage.pixi.getObjectBounds("spinButton");

    expect(bounds.visible).toBe(true);
    expect(bounds.renderable).toBe(true);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });
});
