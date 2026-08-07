import { test as baseTest } from "@playwright/test";
import { GamePage } from "../page-objects/GamePage.js";
import { PixiDriver } from "../drivers/PixiDriver.js";
import { GameAssertions } from "../assertions/GameAssertions.js";

type GameFixtures = {
  gamePage: GamePage;
  pixiDriver: PixiDriver;
  gameAssertions: GameAssertions;
};

export const test = baseTest.extend<GameFixtures>({
  // Each test gets its own session id, so balance/state from one test never
  // leaks into another - there is no bridge-level reset method by design.
  gamePage: async ({ page }, use, testInfo) => {
    await use(new GamePage(page, `test-${testInfo.testId}`));
  },

  pixiDriver: async ({ gamePage }, use) => {
    await use(gamePage.pixi);
  },

  gameAssertions: async ({ gamePage }, use) => {
    await use(new GameAssertions(gamePage));
  },
});

export { expect } from "@playwright/test";
