// Keeps "booting" even though the bridge only attaches once boot is
// complete (so it's never actually observed through it) - the real
// application's GamePhase type includes it, and narrowing this mirror
// would misrepresent that source type.
export type GamePhase = "booting" | "ready" | "spinning" | "result" | "error";

/** What the next mocked spin should do - see GamePage.setNextSpinResult(). */
export type SpinResult = "win" | "loss" | "error";

/** The business-level outcome verifyResult() checks - deliberately narrower than SpinResult, since an API error isn't a "result" to assert on the same way. */
export type GameResult = "win" | "loss";

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
  // The literal text currently shown in the result label, mirrored from
  // the application's GameSnapshot.resultText - lets tests confirm the
  // actual displayed copy, not just the structured outcome.
  resultText: string;
}
