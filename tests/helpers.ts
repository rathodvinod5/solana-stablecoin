import { Keypair } from "@solana/web3.js";

// Shared keypairs used across all test files.
// Using fixed secret keys ensures the same keypairs are used
// regardless of which test file runs first.

export const ADMIN_KEYPAIR = Keypair.fromSeed(
  Buffer.from("solana-stablecoin-admin-keypair-seed-000", "utf8").slice(0, 32),
);

export const MINTER_KEYPAIR = Keypair.fromSeed(
  Buffer.from("solana-stablecoin-minter-keypair-seed-00", "utf8").slice(0, 32),
);

export const MINTER2_KEYPAIR = Keypair.fromSeed(
  Buffer.from("solana-stablecoin-minter2-keypair-seed-0", "utf8").slice(0, 32),
);

export const USER_KEYPAIR = Keypair.fromSeed(
  Buffer.from("solana-stablecoin-user-keypair-seed-0000", "utf8").slice(0, 32),
);

export const ROGUE_KEYPAIR = Keypair.fromSeed(
  Buffer.from("solana-stablecoin-rogue-keypair-seed-000", "utf8").slice(0, 32),
);
