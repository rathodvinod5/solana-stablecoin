import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "../target/types/solana_stablecoin";

describe("solana-stablecoin", () => {
  // Configure the client to use the local cluster.
  // anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .solanaStablecoin as Program<SolanaStablecoin>;
  const admin = anchor.web3.Keypair.generate();
  const minter = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  describe("AIRDROP", async () => {
    before(async () => {
      try {
        await airdrop(
          provider.connection,
          admin.publicKey,
          10 * LAMPORTS_PER_SOL,
        );
        await airdrop(
          provider.connection,
          minter.publicKey,
          10 * LAMPORTS_PER_SOL,
        );
        await airdrop(
          provider.connection,
          user.publicKey,
          10 * LAMPORTS_PER_SOL,
        );
        await airdrop(
          provider.connection,
          provider.wallet.publicKey,
          10 * LAMPORTS_PER_SOL,
        );
      } catch (err) {
        console.log("Error while airdrop: ", err);
      }
    });

    describe("Create config account, mint account, minter config account", async () => {});
  });

  describe("SOME TEST CASES", async () => {
    describe("happy cases", async () => {});

    describe("failure cases", async () => {});
  });
});

async function airdrop(connection: any, address: any, amount = 1000000000) {
  await connection.confirmTransaction(
    await connection.requestAirdrop(address, amount),
    "confirmed",
  );
}
