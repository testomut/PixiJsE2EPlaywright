import type { SpinResult } from "../types/pixiTestBridge.js";

/** A mocked /api/game/spin response: an HTTP status and, for 200s, a body. */
export interface SpinApiResponse {
  status: number;
  body?: SpinResult;
}

export const winningSpinResponse: SpinApiResponse = {
  status: 200,
  body: { win: true, amount: 100, symbols: ["💎", "💎", "💎"] },
};

export const losingSpinResponse: SpinApiResponse = {
  status: 200,
  body: { win: false, amount: 0, symbols: ["🍒", "🍋", "⭐"] },
};

export const spinServerErrorResponse: SpinApiResponse = {
  status: 500,
};

/**
 * A fresh, human-readable player name per call. The uniqueness isn't for
 * randomizing outcomes (those come from the mocked responses above) - it's
 * so each test starts its own isolated session (see GamePage's session id)
 * without any bridge-level reset method.
 */
export function uniquePlayerName(prefix = "Test Player"): string {
  return `${prefix} ${Date.now()}`;
}
