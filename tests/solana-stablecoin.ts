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
  const minter2 = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const rogue = anchor.web3.Keypair.generate();

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
      it("A. 1. Admin has SOL balance", async () => {
        const bal = await provider.connection.getBalance(admin.publicKey);
        assert.ok(bal >= LAMPORTS_PER_SOL, "admin should have at least 1 SOL");
      });

      it("A. 2. Minter has SOL balance", async () => {
        const bal = await provider.connection.getBalance(minter.publicKey);
        assert.ok(bal >= LAMPORTS_PER_SOL, "minter should have at least 1 SOL");
      });
    });
  });

  describe("INIT MINT and CONFIG AMOUNT", async () => {
    before(() => {
      [configPda] = deriveConfig(programId);
      [mintPda] = deriveMint(programId);
    });

    describe("Happy cases", () => {
      it("B. 1. initializes the config and mint accounts successfully", async () => {
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

      it("B. 2. config PDA stores correct bumps", async () => {
        const config = await program.account.config.fetch(configPda);
        const [, expectedConfigBump] = deriveConfig(programId);
        const [, expectedMintBump] = deriveMint(programId);
        assert.strictEqual(config.configBump, expectedConfigBump);
        assert.strictEqual(config.mintBump, expectedMintBump);
      });
    });

    describe("Failure cases", () => {
      it("C. 1. cannot initialize twice (config PDA already exists)", async () => {
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

  describe("CONFIGURE MINTER", () => {
    const allowance = new anchor.BN(1_000_000); // 1 token (6 decimals)

    describe("Happy cases", () => {
      it("D. 1. admin can configure a minter with an allowance", async () => {
        const [minterConfigPda] = deriveMinterConfig(
          minter.publicKey,
          programId,
        );

        await program.methods
          .configureMinter(allowance)
          .accounts({
            admin: admin.publicKey,
            minter: minter.publicKey,
            config: configPda,
            minterConfig: minterConfigPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        const mc = await program.account.minterConfig.fetch(minterConfigPda);
        assert.ok(
          mc.minter.equals(minter.publicKey),
          "minter key should match",
        );
        assert.ok(mc.allowance.eq(allowance), "allowance should match");
        assert.ok(mc.totalMinted.eqn(0), "total_minted should start at 0");
        assert.strictEqual(
          mc.isInitialized,
          true,
          "should be marked initialized",
        );
      });

      it("C. 2. admin can configure a second minter independently", async () => {
        const [minter2ConfigPda] = deriveMinterConfig(
          minter2.publicKey,
          programId,
        );
        const allowance2 = new anchor.BN(500_000);

        await program.methods
          .configureMinter(allowance2)
          .accounts({
            admin: admin.publicKey,
            minter: minter2.publicKey,
            config: configPda,
            minterConfig: minter2ConfigPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        const mc = await program.account.minterConfig.fetch(minter2ConfigPda);
        assert.ok(
          mc.allowance.eq(allowance2),
          "allowance should match for second minter",
        );
      });
    });

    describe("failure cases", () => {
      before(async () => {
        try {
          await airdrop(
            provider.connection,
            rogue.publicKey,
            10 * LAMPORTS_PER_SOL,
          );
        } catch (err) {
          console.log("Error while airdrop: ", err);
        }
      });

      it("non-admin cannot configure a minter (Unauthorised)", async () => {
        const [minterConfigPda] = deriveMinterConfig(
          rogue.publicKey,
          programId,
        );

        try {
          await program.methods
            .configureMinter(allowance)
            .accounts({
              admin: rogue.publicKey, // rogue acting as admin
              minter: rogue.publicKey,
              config: configPda,
              minterConfig: minterConfigPda,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([rogue])
            .rpc();
          assert.fail("Should have thrown Unauthorised");
        } catch (err: any) {
          const anchorErr = err as anchor.AnchorError;
          const msg = anchorErr.error?.errorMessage ?? err.message;
          assert.ok(
            msg.includes("Unauthorised"),
            `Expected Unauthorised error, got: ${msg}`,
          );
        }
      });
    });
  });

  describe("UPDATE MINTER CONFIG", async () => {
    const updatedAllowance = new anchor.BN(2_000_000);

    describe("happy cases", () => {
      it("admin can update minter allowance", async () => {
        const [minterConfigPda] = deriveMinterConfig(
          minter.publicKey,
          programId,
        );

        await program.methods
          .updateMinterConfig(updatedAllowance)
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            minterConfig: minterConfigPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        const mc = await program.account.minterConfig.fetch(minterConfigPda);
        assert.ok(
          mc.allowance.eq(updatedAllowance),
          "allowance should be updated",
        );
      });
    });
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
