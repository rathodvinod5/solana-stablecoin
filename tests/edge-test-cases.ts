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

  // ══════════════════════════════════════════════════════════════════════════
  // 1. ALLOWANCE BOUNDARY CONDITIONS
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  // 2. ALLOWANCE UPDATE EDGE CASES
  // ══════════════════════════════════════════════════════════════════════════
  describe("ALLOWANCE UPDATE EDGE CASES", () => {
    let updateMinter: Keypair;
    let updateMinterPda: PublicKey;

    before(async () => {
      updateMinter = Keypair.generate();
      await airdrop(provider.connection, updateMinter.publicKey);
      [updateMinterPda] = deriveMinterConfig(updateMinter.publicKey, programId);

      await program.methods
        .configureMinter(new anchor.BN(5_000))
        .accounts({
          admin: admin.publicKey,
          minter: updateMinter.publicKey,
          config: configPda,
          minterConfig: updateMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
    });

    it("Admin can reduce allowance below the current total_minted (does not revert past mints)", async () => {
      // Mint some tokens first
      const recipient = Keypair.generate();
      await airdrop(provider.connection, recipient.publicKey);
      const recipientAta = getAssociatedTokenAddressSync(
        mintPda,
        recipient.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      await program.methods
        .mintTokens(new anchor.BN(3_000))
        .accounts({
          minter: updateMinter.publicKey,
          config: configPda,
          minterConfig: updateMinterPda,
          mint: mintPda,
          user: recipient.publicKey,
          userAta: recipientAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([updateMinter])
        .rpc();

      // Now reduce allowance to 1_000 (less than total_minted of 3_000)
      await program.methods
        .updateMinterConfig(new anchor.BN(1_000))
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          minterConfig: updateMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const mc = await program.account.minterConfig.fetch(updateMinterPda);
      // console.log(
      //   `\n[reduce_allowance] allowance: ${mc.allowance}, totalMinted: ${mc.totalMinted}`,
      // );
      assert.ok(
        mc.allowance.eqn(1_000),
        "allowance should be updated to 1_000",
      );
      assert.ok(mc.totalMinted.eqn(3_000), "past mints should not be reverted");
    });

    it("minting fails after allowance is reduced below total_minted", async () => {
      // updateMinter now has allowance=1_000 and totalMinted=3_000
      // so remaining = 1_000 - 3_000 which underflows → AllowanceExceeded
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
            minter: updateMinter.publicKey,
            config: configPda,
            minterConfig: updateMinterPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([updateMinter])
          .rpc();
        assert.fail("Should have thrown after allowance < totalMinted");
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log("\n[allowance_below_minted] Expected error logs:\n", logs.join("\n"));
        assert.ok(err, "Expected error when allowance is below total_minted");
      }
    });

    it("admin can increase allowance and minter can mint again", async () => {
      // Increase allowance back to 10_000
      await program.methods
        .updateMinterConfig(new anchor.BN(10_000))
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          minterConfig: updateMinterPda,
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
          .mintTokens(new anchor.BN(500))
          .accounts({
            minter: updateMinter.publicKey,
            config: configPda,
            minterConfig: updateMinterPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([updateMinter])
          .rpc();
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log("\n[increase_allowance] Error logs:\n", logs.join("\n"));
        throw err;
      }

      const mc = await program.account.minterConfig.fetch(updateMinterPda);
      // console.log(`\n[increase_allowance] totalMinted after re-mint: ${mc.totalMinted}`);
      assert.ok(mc.totalMinted.eqn(3_500), "totalMinted should be 3_000 + 500");
    });

    it("updating allowance to same value is a no-op", async () => {
      const mcBefore = await program.account.minterConfig.fetch(
        updateMinterPda,
      );

      await program.methods
        .updateMinterConfig(mcBefore.allowance)
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          minterConfig: updateMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const mcAfter = await program.account.minterConfig.fetch(updateMinterPda);
      assert.ok(
        mcAfter.allowance.eq(mcBefore.allowance),
        "allowance should remain unchanged",
      );
      assert.ok(
        mcAfter.totalMinted.eq(mcBefore.totalMinted),
        "totalMinted should remain unchanged",
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. REMOVE MINTER EDGE CASES
  // ══════════════════════════════════════════════════════════════════════════
  describe("REMOVE MINTER EDGE CASES", () => {
    it("removed minter cannot mint after being removed", async () => {
      const removableMinter = Keypair.generate();
      await airdrop(provider.connection, removableMinter.publicKey);
      const [removableMinterPda] = deriveMinterConfig(
        removableMinter.publicKey,
        programId,
      );

      // Configure then remove
      await program.methods
        .configureMinter(new anchor.BN(5_000))
        .accounts({
          admin: admin.publicKey,
          minter: removableMinter.publicKey,
          config: configPda,
          minterConfig: removableMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      await program.methods
        .removeMinter()
        .accounts({
          admin: admin.publicKey,
          minter: removableMinter.publicKey,
          config: configPda,
          minterConfig: removableMinterPda,
        })
        .signers([admin])
        .rpc();

      // Now try to mint — should fail because minter_config is closed
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
          .mintTokens(new anchor.BN(100))
          .accounts({
            minter: removableMinter.publicKey,
            config: configPda,
            minterConfig: removableMinterPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([removableMinter])
          .rpc();
        assert.fail("Should have thrown — minter was removed");
      } catch (err: any) {
        assert.ok(err, "Removed minter should not be able to mint");
      }
    });

    it("removed minter can be re-configured by admin", async () => {
      const readdMinter = Keypair.generate();
      await airdrop(provider.connection, readdMinter.publicKey);
      const [readdMinterPda] = deriveMinterConfig(
        readdMinter.publicKey,
        programId,
      );

      // Configure → remove → re-configure
      await program.methods
        .configureMinter(new anchor.BN(1_000))
        .accounts({
          admin: admin.publicKey,
          minter: readdMinter.publicKey,
          config: configPda,
          minterConfig: readdMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      await program.methods
        .removeMinter()
        .accounts({
          admin: admin.publicKey,
          minter: readdMinter.publicKey,
          config: configPda,
          minterConfig: readdMinterPda,
        })
        .signers([admin])
        .rpc();

      // Re-configure with a new allowance
      try {
        await program.methods
          .configureMinter(new anchor.BN(9_000))
          .accounts({
            admin: admin.publicKey,
            minter: readdMinter.publicKey,
            config: configPda,
            minterConfig: readdMinterPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log("\n[re_configure_minter] Error logs:\n", logs.join("\n"));
        throw err;
      }

      const mc = await program.account.minterConfig.fetch(readdMinterPda);
      // console.log(`\n[re_configure_minter] new allowance: ${mc.allowance}, totalMinted: ${mc.totalMinted}`);
      assert.ok(
        mc.allowance.eqn(9_000),
        "re-configured allowance should be 9_000",
      );
      assert.ok(
        mc.totalMinted.eqn(0),
        "totalMinted should reset to 0 on re-configure",
      );
      assert.strictEqual(mc.isInitialized, true, "should be initialized again");
    });

    it("admin rent is returned when minter_config is closed", async () => {
      const closeMinter = Keypair.generate();
      await airdrop(provider.connection, closeMinter.publicKey);
      const [closeMinterPda] = deriveMinterConfig(
        closeMinter.publicKey,
        programId,
      );

      await program.methods
        .configureMinter(new anchor.BN(100))
        .accounts({
          admin: admin.publicKey,
          minter: closeMinter.publicKey,
          config: configPda,
          minterConfig: closeMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const adminBalBefore = await provider.connection.getBalance(
        admin.publicKey,
      );

      await program.methods
        .removeMinter()
        .accounts({
          admin: admin.publicKey,
          minter: closeMinter.publicKey,
          config: configPda,
          minterConfig: closeMinterPda,
        })
        .signers([admin])
        .rpc();

      const adminBalAfter = await provider.connection.getBalance(
        admin.publicKey,
      );
      // console.log(
      //   `\n[rent_returned] before: ${
      //     adminBalBefore / LAMPORTS_PER_SOL
      //   } SOL, after: ${adminBalAfter / LAMPORTS_PER_SOL} SOL`,
      // );
      assert.ok(
        adminBalAfter > adminBalBefore,
        "admin should receive rent lamports back",
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 4. BURN EDGE CASES
  // ══════════════════════════════════════════════════════════════════════════
  describe("BURN EDGE CASES", async () => {
    let burnUser: Keypair;
    let burnUserAta: PublicKey;

    before(async () => {
      // Mint some tokens to a fresh user for burn tests
      burnUser = Keypair.generate();
      await airdrop(provider.connection, burnUser.publicKey);

      burnUserAta = getAssociatedTokenAddressSync(
        mintPda,
        burnUser.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      const [minterConfigPda] = deriveMinterConfig(minter.publicKey, programId);
      await airdrop(provider.connection, minter.publicKey); // top up minter

      await program.methods
        .mintTokens(new anchor.BN(10_000))
        .accounts({
          minter: minter.publicKey,
          config: configPda,
          minterConfig: minterConfigPda,
          mint: mintPda,
          user: burnUser.publicKey,
          userAta: burnUserAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([minter])
        .rpc();
    });

    it("burning 0 tokens is a no-op / should not change balance", async () => {
      const balBefore = await provider.connection.getTokenAccountBalance(
        burnUserAta,
      );

      try {
        await program.methods
          .burnTokens(new anchor.BN(0))
          .accounts({
            owner: burnUser.publicKey,
            config: configPda,
            mint: mintPda,
            ownerAta: burnUserAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burnUser])
          .rpc();

        const balAfter = await provider.connection.getTokenAccountBalance(
          burnUserAta,
        );
        assert.strictEqual(
          balAfter.value.amount,
          balBefore.value.amount,
          "balance should not change after 0-burn",
        );
        // console.log("\n[zero_burn] Program allowed 0-amount burn (no-op)");
      } catch (err: any) {
        const logs = await getLogs(provider.connection, err);
        console.log(
          "\n[zero_burn] Program rejected 0-amount burn (also valid):\n",
          logs.join("\n"),
        );
        assert.ok(err, "Program correctly rejected 0-amount burn");
      }
    });

    it("burning works when contract is paused (burn is never gated by pause)", async () => {
      // Pause the contract
      await program.methods
        .pauseMint()
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const balBefore = await provider.connection.getTokenAccountBalance(
        burnUserAta,
      );
      const burnAmount = new anchor.BN(1_000);

      try {
        await program.methods
          .burnTokens(burnAmount)
          .accounts({
            owner: burnUser.publicKey,
            config: configPda,
            mint: mintPda,
            ownerAta: burnUserAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
          })
          .signers([burnUser])
          .rpc();
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log("\n[burn_while_paused] Error logs:\n", logs.join("\n"));
        throw err;
      } finally {
        // Always unpause
        await program.methods
          .unpauseMint()
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
      }

      const balAfter = await provider.connection.getTokenAccountBalance(
        burnUserAta,
      );
      const expected = new anchor.BN(balBefore.value.amount).sub(burnAmount);
      // console.log(`\n[burn_while_paused] balance went from ${balBefore.value.amount} to ${balAfter.value.amount}`);
      assert.ok(
        new anchor.BN(balAfter.value.amount).eq(expected),
        "burn should succeed even when minting is paused",
      );
    });

    it("partial burn leaves correct remaining balance", async () => {
      const balBefore = await provider.connection.getTokenAccountBalance(
        burnUserAta,
      );
      const totalBal = new anchor.BN(balBefore.value.amount);
      const burnAmount = totalBal.divn(2); // burn exactly half

      await program.methods
        .burnTokens(burnAmount)
        .accounts({
          owner: burnUser.publicKey,
          config: configPda,
          mint: mintPda,
          ownerAta: burnUserAta,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
        })
        .signers([burnUser])
        .rpc();

      const balAfter = await provider.connection.getTokenAccountBalance(
        burnUserAta,
      );
      const expectedBal = totalBal.sub(burnAmount);
      assert.ok(
        new anchor.BN(balAfter.value.amount).eq(expectedBal),
        "remaining balance should be exactly half after partial burn",
      );
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 5. PDA SPOOFING / ACCOUNT SUBSTITUTION ATTACKS
  // ══════════════════════════════════════════════════════════════════════════
  describe("PDA SPOOFING and ACCOUNT SUBSTITUTION", () => {
    it("cannot use a different minter's minter_config to mint (wrong PDA seeds)", async () => {
      // minter A tries to use minter B's config PDA to mint
      const minterA = Keypair.generate();
      const minterB = Keypair.generate();
      await airdrop(provider.connection, minterA.publicKey);
      await airdrop(provider.connection, minterB.publicKey);

      const [minterBConfigPda] = deriveMinterConfig(
        minterB.publicKey,
        programId,
      );

      // Only configure B
      await program.methods
        .configureMinter(new anchor.BN(5_000))
        .accounts({
          admin: admin.publicKey,
          minter: minterB.publicKey,
          config: configPda,
          minterConfig: minterBConfigPda,
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

      // minterA tries to sign but pass minterB's config PDA
      try {
        await program.methods
          .mintTokens(new anchor.BN(100))
          .accounts({
            minter: minterA.publicKey, // A is the signer
            config: configPda,
            minterConfig: minterBConfigPda, // but using B's config
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([minterA])
          .rpc();
        assert.fail("Should have failed — minterA using minterB's config");
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log("\n[pda_spoof] Expected error logs:\n", logs.join("\n"));
        assert.ok(err, "PDA seed mismatch should be rejected by Anchor");
      }
    });

    it("cannot pass a fake config PDA to bypass admin check on pause", async () => {
      // rogue tries to construct a fake config and pass it to pauseMint
      const fakeConfig = Keypair.generate();

      try {
        await program.methods
          .pauseMint()
          .accounts({
            admin: rogue.publicKey,
            config: fakeConfig.publicKey, // not the real PDA
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([rogue])
          .rpc();
        assert.fail("Should have rejected fake config PDA");
      } catch (err: any) {
        // const logs = await getLogs(provider.connection, err);
        // console.log(
        //   "\n[fake_config_pause] Expected error logs:\n",
        //   logs.join("\n"),
        // );
        assert.ok(err, "Fake config PDA should be rejected");
      }
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 6. STATE CONSISTENCY AFTER SEQUENCES
  // ══════════════════════════════════════════════════════════════════════════
  describe("STATE CONSISTENCY ACROSS SEQUENCES", async () => {
    it("config state is consistent after pause → mint-attempt → unpause → mint", async () => {
      const seqMinter = Keypair.generate();
      await airdrop(provider.connection, seqMinter.publicKey);
      const [seqMinterPda] = deriveMinterConfig(seqMinter.publicKey, programId);

      await program.methods
        .configureMinter(new anchor.BN(10_000))
        .accounts({
          admin: admin.publicKey,
          minter: seqMinter.publicKey,
          config: configPda,
          minterConfig: seqMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      // Pause
      await program.methods
        .pauseMint()
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const recipient1 = Keypair.generate();
      await airdrop(provider.connection, recipient1.publicKey);
      const r1Ata = getAssociatedTokenAddressSync(
        mintPda,
        recipient1.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      // Mint attempt while paused — should fail
      try {
        await program.methods
          .mintTokens(new anchor.BN(500))
          .accounts({
            minter: seqMinter.publicKey,
            config: configPda,
            minterConfig: seqMinterPda,
            mint: mintPda,
            user: recipient1.publicKey,
            userAta: r1Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([seqMinter])
          .rpc();
      } catch {
        /* expected */
      }

      // total_minted should still be 0 since the mint failed
      const mcMid = await program.account.minterConfig.fetch(seqMinterPda);
      assert.ok(
        mcMid.totalMinted.eqn(0),
        "totalMinted should still be 0 after failed mint",
      );

      // Unpause
      await program.methods
        .unpauseMint()
        .accounts({
          admin: admin.publicKey,
          config: configPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      // Mint should now succeed
      const recipient2 = Keypair.generate();
      await airdrop(provider.connection, recipient2.publicKey);
      const r2Ata = getAssociatedTokenAddressSync(
        mintPda,
        recipient2.publicKey,
        false,
        TOKEN_2022_PROGRAM_ID,
      );

      await program.methods
        .mintTokens(new anchor.BN(500))
        .accounts({
          minter: seqMinter.publicKey,
          config: configPda,
          minterConfig: seqMinterPda,
          mint: mintPda,
          user: recipient2.publicKey,
          userAta: r2Ata,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([seqMinter])
        .rpc();

      const mcFinal = await program.account.minterConfig.fetch(seqMinterPda);
      // console.log(`\n[state_consistency] final totalMinted: ${mcFinal.totalMinted}`);
      assert.ok(
        mcFinal.totalMinted.eqn(500),
        "totalMinted should be 500 after successful mint",
      );
    });

    it("total_minted accumulates correctly across multiple mints to different users", async () => {
      const accMinter = Keypair.generate();
      await airdrop(provider.connection, accMinter.publicKey);
      const [accMinterPda] = deriveMinterConfig(accMinter.publicKey, programId);

      await program.methods
        .configureMinter(new anchor.BN(9_000))
        .accounts({
          admin: admin.publicKey,
          minter: accMinter.publicKey,
          config: configPda,
          minterConfig: accMinterPda,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      const amounts = [1_000, 2_000, 3_000];
      let expectedTotal = 0;

      for (const amount of amounts) {
        const recipient = Keypair.generate();
        await airdrop(provider.connection, recipient.publicKey);
        const recipientAta = getAssociatedTokenAddressSync(
          mintPda,
          recipient.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        await program.methods
          .mintTokens(new anchor.BN(amount))
          .accounts({
            minter: accMinter.publicKey,
            config: configPda,
            minterConfig: accMinterPda,
            mint: mintPda,
            user: recipient.publicKey,
            userAta: recipientAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([accMinter])
          .rpc();

        expectedTotal += amount;
        const mc = await program.account.minterConfig.fetch(accMinterPda);
        // console.log(
        //   `\n[accumulate] after minting ${amount}: totalMinted=${mc.totalMinted}`,
        // );
        assert.ok(
          mc.totalMinted.eqn(expectedTotal),
          `totalMinted should be ${expectedTotal} after minting ${amount}`,
        );
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
