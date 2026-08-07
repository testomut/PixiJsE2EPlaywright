// Keeps "booting" even though the bridge only attaches once boot is
// complete (so it's never actually observed through it) - the real
// application's GamePhase type includes it, and narrowing this mirror
// would misrepresent that source type.
export type GamePhase = "booting" | "ready" | "spinning" | "result" | "error";

/** The business-level outcome verifyResult() checks. An API error isn't a "result" to assert on the same way - see SpinMockResult. */
export type GameResult = "win" | "loss";

/** What the next mocked spin should do - see GamePage.setNextSpinResult(). Wider than GameResult because a mock can also simulate a failed request. */
export type SpinMockResult = GameResult | "error";

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
// Displayed text (resultText, etc.) is read separately via
// PixiController.getText() rather than duplicated in here - see README.
export interface GameSnapshot {
  phase: GamePhase;
  playerName: string;
  balance: number;
  betAmount: number;
  lastResult: SpinOutcome | null;
}
