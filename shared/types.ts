/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

import type { Account } from "../drizzle/schema";

export type * from "../drizzle/schema";

/** Account as returned by tRPC: key ciphertexts stripped, key tail added. */
export type PublicAccount = Omit<Account, "apiKey" | "apiSecret"> & {
  apiKeyTail: string;
};
