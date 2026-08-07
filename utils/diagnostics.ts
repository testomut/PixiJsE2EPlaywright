import type { Page } from "@playwright/test";

// Mirrors the labels the application registers in its namedObjects map
// (demo-app/src/game/GameApp.ts in testomut/pixijs-e2e-testing-demo). The
// bridge deliberately has no "list all labels" method, so this is kept
// here purely to make error messages useful, not as a structural
// dependency on the application.
export const KNOWN_OBJECT_LABELS = [
  "spinButton",
  "reelsDisplay",
  "balanceDisplay",
  "stateDisplay",
  "resultText",
  "betMinus",
  "betPlus",
] as const;

/**
 * Builds a diagnostic string for failure messages: the current game
 * snapshot and canvas geometry, without dumping the whole Pixi stage.
 */
export async function describeAppState(page: Page): Promise<string> {
  const canvasBox = await page
    .locator("canvas")
    .boundingBox()
    .catch(() => null);
  const snapshot = await page
    .evaluate(() => window.__TEST_APP__?.getGameSnapshot() ?? null)
    .catch(() => null);

  return [
    `canvas bounds: ${JSON.stringify(canvasBox)}`,
    `game snapshot: ${JSON.stringify(snapshot)}`,
    `known object labels: ${KNOWN_OBJECT_LABELS.join(", ")}`,
  ].join("\n");
}
