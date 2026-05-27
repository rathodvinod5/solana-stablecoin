import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "../target/types/solana_stablecoin";
import { assert } from "chai";

describe("solana-stablecoin", () => {
  // Configure the client to use the local cluster.
  // anchor.setProvider(anchor.AnchorProvider.env());

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .solanaStablecoin as Program<SolanaStablecoin>;
  const programId = program.programId;
  const admin = anchor.web3.Keypair.generate();
  const minter = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();

  // const admin   = Keypair.generate();
  // const minter  = Keypair.generate();
  // const minter2 = Keypair.generate();
  // const user    = Keypair.generate();
  // const rogue   = Keypair.generate();

  // Derived PDAs (populated after initialize)
  let configPda: PublicKey;
  let mintPda: PublicKey;

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

    describe("Create config account, mint account, minter config account", async () => {
      it("admin has SOL balance", async () => {
        const bal = await provider.connection.getBalance(admin.publicKey);
        assert.isAtLeast(
          bal,
          LAMPORTS_PER_SOL,
          "admin should have at least 1 SOL",
        );
      });

      it("minter has SOL balance", async () => {
        const bal = await provider.connection.getBalance(minter.publicKey);
        assert.isAtLeast(
          bal,
          LAMPORTS_PER_SOL,
          "minter should have at least 1 SOL",
        );
      });
    });
  });

  describe("SOME TEST CASES", async () => {
    describe("happy cases", async () => {});

    describe("failure cases", async () => {});
  });
});

async function airdrop(
  connection: any,
  address: PublicKey,
  amount = 10 * LAMPORTS_PER_SOL,
) {
  await connection.confirmTransaction(
    await connection.requestAirdrop(address, amount),
    "confirmed",
  );
}

function deriveConfig(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

function deriveMint(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("mint")], programId);
}

function deriveMinterConfig(
  minterKey: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), minterKey.toBuffer()],
    programId,
  );
}
