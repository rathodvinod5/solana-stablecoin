import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { SolanaStablecoin } from "../target/types/solana_stablecoin";
import assert from "assert";

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

    describe("VALIDATE SOL AMOUNT", async () => {
      it("admin has SOL balance", async () => {
        const bal = await provider.connection.getBalance(admin.publicKey);
        // assert.isAtLeast(
        //   bal,
        //   LAMPORTS_PER_SOL,
        //   "admin should have at least 1 SOL",
        // );
        assert.ok(bal >= LAMPORTS_PER_SOL, "admin should have at least 1 SOL");
      });

      it("minter has SOL balance", async () => {
        const bal = await provider.connection.getBalance(minter.publicKey);
        // assert.isAtLeast(
        //   bal,
        //   LAMPORTS_PER_SOL,
        //   "minter should have at least 1 SOL",
        // );
        assert.ok(bal >= LAMPORTS_PER_SOL, "minter should have at least 1 SOL");
      });
    });

    describe("INIT MINT and CONFIG AMOUNT", async () => {
      before(() => {
        [configPda] = deriveConfig(programId);
        [mintPda] = deriveMint(programId);
      });

      describe("Happy cases", () => {
        it("initializes the config and mint accounts successfully", async () => {
          await program.methods
            .initialize()
            .accounts({
              admin: admin.publicKey,
              config: configPda,
              mint: mintPda,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([admin])
            .rpc();

          const config = await program.account.config.fetch(configPda);
          assert.ok(
            config.admin.equals(admin.publicKey),
            "admin key should match",
          );
          assert.ok(config.mint.equals(mintPda), "mint key should match");
          assert.strictEqual(
            config.isPaused,
            false,
            "should not be paused on init",
          );
        });

        it("config PDA stores correct bumps", async () => {
          const config = await program.account.config.fetch(configPda);
          const [, expectedConfigBump] = deriveConfig(programId);
          const [, expectedMintBump] = deriveMint(programId);
          assert.strictEqual(config.configBump, expectedConfigBump);
          assert.strictEqual(config.mintBump, expectedMintBump);
        });
      });

      describe("Failure cases", () => {
        it("cannot initialize twice (config PDA already exists)", async () => {
          try {
            await program.methods
              .initialize()
              .accounts({
                admin: admin.publicKey,
                config: configPda,
                mint: mintPda,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
              })
              .signers([admin])
              .rpc();
            assert.fail("Should have thrown on double-init");
          } catch (err) {
            assert.ok(err, "Expected an error on double initialization");
          }
        });
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
