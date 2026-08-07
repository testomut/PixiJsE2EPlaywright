// Mirrors the application's window.__TEST_APP__ shape, defined in
// testomut/pixijs-e2e-testing-demo (demo-app/src/types.ts). Duplicated
// rather than imported because the application and this Playwright
// project are separate repositories with no shared package - this is
// the single copy of the shape this project's tests rely on.

export type GamePhase = "booting" | "ready" | "spinning" | "result" | "error";

export interface SpinResult {
  win: boolean;
  amount: number;
  symbols: string[];
}

export interface PixiObjectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
  renderable: boolean;
}

export interface GameSnapshot {
  phase: GamePhase;
  playerName: string;
  balance: number;
  betAmount: number;
  lastResult: SpinResult | null;
}

export interface TestBridge {
  isReady(): boolean;
  getObjectBounds(label: string): PixiObjectBounds | null;
  getGameSnapshot(): GameSnapshot;
}

declare global {
  interface Window {
    __TEST_APP__: TestBridge;
  }
}
