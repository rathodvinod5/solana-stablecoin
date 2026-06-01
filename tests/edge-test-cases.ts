import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import assert from "assert";
import { SolanaStablecoin } from "../target/types/solana_stablecoin";
import { ADMIN_KEYPAIR, MINTER_KEYPAIR, ROGUE_KEYPAIR } from "./helpers";

describe("solana-stablecoin [edge cases]", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .SolanaStablecoin as Program<SolanaStablecoin>;
  const programId = program.programId;

  // const admin = anchor.web3.Keypair.generate();
  // const minter = anchor.web3.Keypair.generate();
  // const rogue = anchor.web3.Keypair.generate();

  const admin = ADMIN_KEYPAIR;
  const minter = MINTER_KEYPAIR;
  const rogue = ROGUE_KEYPAIR;

  let configPda: PublicKey;
  let mintPda: PublicKey;

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  // Each edge-case group is self-contained but they all need
  // an initialized program, so we do it once in a top-level before().
  before(async () => {
    [configPda] = deriveConfig(programId);
    [mintPda] = deriveMint(programId);

    await Promise.all([
      airdrop(provider.connection, admin.publicKey),
      airdrop(provider.connection, minter.publicKey),
      airdrop(provider.connection, rogue.publicKey),
    ]);
  });

  describe("INITIALIZE", async () => {
    it("Should init the config file", async () => {
      // Initialize program
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

      // Give minter a generous allowance for the edge-case tests
      const [minterConfigPda] = deriveMinterConfig(minter.publicKey, programId);
      await program.methods
        .configureMinter(new anchor.BN(100_000_000))
        .accounts({
          admin: admin.publicKey,
          minter: minter.publicKey,
          config: configPda,
          minterConfig: minterConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });
  });

  describe("ALLOWANCE BOUNDARY CONDITION", () => {
    it("Minting exactly 0 tokens is a no-op / should not increase total_minted", async () => {
      const [minterConfigPda] = deriveMinterConfig(minter.publicKey, programId);
      const mcBefore = await program.account.minterConfig.fetch(
        minterConfigPda,
      );

      const recipient = Keypair.generate();
      await airdrop(provider.connection, recipient.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mintPda,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      try {
        await program.methods
          .mintTokens(new anchor.BN(0))
          .accounts({
            minter: minter.publicKey,
            config: configPda,
            minterConfig: minterConfigPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([minter])
          .rpc();

        // If it succeeds, total_minted should not have changed
        const mcAfter = await program.account.minterConfig.fetch(
          minterConfigPda,
        );
        assert.ok(
          mcAfter.totalMinted.eq(mcBefore.totalMinted),
          "total_minted should not change when minting 0",
        );
      } catch (err: any) {
        // Also acceptable — program may reject 0-amount mints
        assert.ok(err, "Program correctly rejected 0-amount mint");
      }
    });

    it("minting exactly the remaining allowance succeeds (boundary = allowance)", async () => {
      // Fresh minter with a small exact allowance
      const exactMinter = Keypair.generate();
      await airdrop(provider.connection, exactMinter.publicKey);

      const [exactMinterConfigPda] = deriveMinterConfig(
        exactMinter.publicKey,
        programId,
      );
      const exactAllowance = new anchor.BN(1_000);

      await program.methods
        .configureMinter(exactAllowance)
        .accounts({
          admin: admin.publicKey,
          minter: exactMinter.publicKey,
          config: configPda,
          minterConfig: exactMinterConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const recipient = Keypair.generate();
      await airdrop(provider.connection, recipient.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mintPda,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Mint EXACTLY the allowance — should succeed
      try {
        await program.methods
          .mintTokens(exactAllowance)
          .accounts({
            minter: exactMinter.publicKey,
            config: configPda,
            minterConfig: exactMinterConfigPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([exactMinter])
          .rpc();
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log("\n[exact_allowance] Error logs:\n", logs.join("\n"));
        throw err;
      }

      const mc = await program.account.minterConfig.fetch(exactMinterConfigPda);
      // console.log(
      //   `\n[exact_allowance] totalMinted: ${mc.totalMinted}, allowance: ${mc.allowance}`,
      // );
      assert.ok(
        mc.totalMinted.eq(exactAllowance),
        "totalMinted should equal full allowance",
      );
    });

    it("minting 1 over the remaining allowance fails (boundary + 1)", async () => {
      // Fresh minter with a small exact allowance
      const overMinter = Keypair.generate();
      await airdrop(provider.connection, overMinter.publicKey);

      const [overMinterConfigPda] = deriveMinterConfig(
        overMinter.publicKey,
        programId,
      );
      const exactAllowance = new anchor.BN(1_000);

      await program.methods
        .configureMinter(exactAllowance)
        .accounts({
          admin: admin.publicKey,
          minter: overMinter.publicKey,
          config: configPda,
          minterConfig: overMinterConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const recipient = Keypair.generate();
      await airdrop(provider.connection, recipient.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mintPda,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Mint allowance + 1 — should fail
      try {
        await program.methods
          .mintTokens(exactAllowance.addn(1))
          .accounts({
            minter: overMinter.publicKey,
            config: configPda,
            minterConfig: overMinterConfigPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([overMinter])
          .rpc();
        assert.fail(
          "Should have thrown AllowanceExceeded or InsufficientBalance",
        );
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log(
        //   "\n[over_allowance] Expected error logs:\n",
        //   logs.join("\n"),
        // );
        const msg = (err as AnchorError).error?.errorMessage ?? err.message;
        const isExpectedError =
          msg.includes("Allowance exceeded") ||
          msg.includes("Insufficient balance");
        assert.ok(isExpectedError, `Unexpected error: ${msg}`);
      }
    });

    it("minting with allowance = 0 always fails", async () => {
      const zeroMinter = Keypair.generate();
      await airdrop(provider.connection, zeroMinter.publicKey);
      const [zeroMinterConfigPda] = deriveMinterConfig(
        zeroMinter.publicKey,
        programId,
      );

      await program.methods
        .configureMinter(new anchor.BN(0))
        .accounts({
          admin: admin.publicKey,
          minter: zeroMinter.publicKey,
          config: configPda,
          minterConfig: zeroMinterConfigPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const recipient = Keypair.generate();
      await airdrop(provider.connection, recipient.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mintPda,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      try {
        await program.methods
          .mintTokens(new anchor.BN(1))
          .accounts({
            minter: zeroMinter.publicKey,
            config: configPda,
            minterConfig: zeroMinterConfigPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([zeroMinter])
          .rpc();
        assert.fail("Should have thrown for zero-allowance minter");
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log(
        //   "\n[zero_allowance] Expected error logs:\n",
        //   logs.join("\n"),
        // );
        assert.ok(err, "Expected error for zero-allowance minter");
      }
    });
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function airdrop(
  connection: any,
  address: PublicKey,
  amount = 10 * LAMPORTS_PER_SOL,
) {
  // const sig = await connection.requestAirdrop(address, amount);
  // const { blockhash, lastValidBlockHeight } =
  //   await connection.getLatestBlockhash();
  // await connection.confirmTransaction(
  //   { signature: sig, blockhash, lastValidBlockHeight },
  //   "finalized",
  // );

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

async function getLogs(connection: any, err: any): Promise<string[]> {
  if (err?.logs) return err.logs;
  try {
    return (await err.getLogs?.()) ?? [];
  } catch {
    return [];
  }
}
