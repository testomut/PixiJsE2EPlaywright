import type { GameSnapshot } from "./game.types.js";

// Only labels that exist as real, stable container.label values in the
// application (see GameApp.ts's namedObjects map in
// testomut/pixijs-e2e-testing-demo) - not every decorative sprite.
export type PixiObjectLabel =
  | "spinButton"
  | "reelsDisplay"
  | "balanceDisplay"
  | "stateDisplay"
  | "resultText"
  | "betMinus"
  | "betPlus";

export interface PixiObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  renderable: boolean;
}

// The application-owned, read-only observability bridge. Mirrored here
// because the application and this project are separate repositories -
// this is the one copy this project's code relies on.
export interface TestBridge {
  isReady(): boolean;
  getObjectBounds(label: string): PixiObjectBounds | null;
  getGameSnapshot(): GameSnapshot;
}

declare global {
  interface Window {
    __TEST_APP__?: TestBridge;
  }
}
