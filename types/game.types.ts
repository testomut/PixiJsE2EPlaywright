export type GamePhase = "booting" | "ready" | "spinning" | "result" | "error";

/** What the next mocked spin should do - see GamePage.setNextSpinResult(). */
export type SpinResult = "win" | "loss" | "error";

export interface Player {
  nickname: string;
}

/** The concrete outcome of a completed spin, as returned by the real API. */
export interface SpinOutcome {
  win: boolean;
  amount: number;
  symbols: string[];
}

// Includes betAmount and the full SpinOutcome (not just a 'win'/'loss'
// flag) because verifying exact balance arithmetic after a spin is real,
// existing test coverage this project keeps - not an invented field.
export interface GameSnapshot {
  phase: GamePhase;
  playerName: string;
  balance: number;
  betAmount: number;
  lastResult: SpinOutcome | null;
}
