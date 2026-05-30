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
  const user3 = anchor.web3.Keypair.generate();
  const user4 = anchor.web3.Keypair.generate();
  const user5 = anchor.web3.Keypair.generate();
  const rogue = anchor.web3.Keypair.generate();
  const fakeMinter = anchor.web3.Keypair.generate();

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
      it("Admin has SOL balance", async () => {
        const bal = await provider.connection.getBalance(admin.publicKey);
        assert.ok(bal >= LAMPORTS_PER_SOL, "admin should have at least 1 SOL");
      });

      it("Minter has SOL balance", async () => {
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

  describe("CONFIGURE MINTER", () => {
    const allowance = new anchor.BN(1_000_000); // 1 token (6 decimals)

    describe("Happy cases", () => {
      it("admin can configure a minter with an allowance", async () => {
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

      it("admin can configure a second minter independently", async () => {
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

    describe("Happy cases", () => {
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

    describe("Failure cases", () => {
      it("non-admin cannot update minter config (Unauthorised)", async () => {
        const [minterConfigPda] = deriveMinterConfig(
          minter.publicKey,
          programId,
        );

        try {
          await program.methods
            .updateMinterConfig(new anchor.BN(9_999_999))
            .accounts({
              admin: rogue.publicKey,
              config: configPda,
              minterConfig: minterConfigPda,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([rogue])
            .rpc();
          assert.fail("Should have thrown Unauthorised");
        } catch (err: any) {
          assert.ok(err, "Expected error for unauthorized update");
        }
      });

      it("cannot update an uninitialized minter config (UninitilizedMinter)", async () => {
        const fakeMinter = anchor.web3.Keypair.generate();
        const [fakeMinterConfigPda] = deriveMinterConfig(
          fakeMinter.publicKey,
          programId,
        );

        try {
          await program.methods
            .updateMinterConfig(new anchor.BN(100))
            .accounts({
              admin: admin.publicKey,
              config: configPda,
              minterConfig: fakeMinterConfigPda,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([admin])
            .rpc();
          assert.fail("Should have thrown for uninitialized minter");
        } catch (err: any) {
          assert.ok(err, "Expected error for uninitialized minter config");
        }
      });
    });
  });

  // ── PAUSE / UNPAUSE ────────────────────────────────────────────────────────
  describe("PAUSE / UNPAUSE MINT", async () => {
    describe("Happy cases", async () => {
      it("admin can pause minting", async () => {
        await program.methods
          .pauseMint()
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        const config = await program.account.config.fetch(configPda);
        assert.strictEqual(config.isPaused, true, "config should be paused");
      });

      it("admin can unpause minting", async () => {
        await program.methods
          .unpauseMint()
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        const config = await program.account.config.fetch(configPda);
        assert.strictEqual(config.isPaused, false, "config should be unpaused");
      });

      it("pause → unpause → pause cycle works correctly", async () => {
        for (const shouldBePaused of [true, false, true]) {
          if (shouldBePaused) {
            await program.methods
              .pauseMint()
              .accounts({
                admin: admin.publicKey,
                config: configPda,
                systemProgram: anchor.web3.SystemProgram.programId,
              })
              .signers([admin])
              .rpc();
          } else {
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
          const { isPaused } = await program.account.config.fetch(configPda);
          assert.strictEqual(isPaused, shouldBePaused);
        }
        // Restore to unpaused for subsequent tests
        await program.methods
          .unpauseMint()
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();
      });
    });

    describe("Failure cases", async () => {
      it("non-admin cannot pause mint (Unauthorised)", async () => {
        try {
          await program.methods
            .pauseMint()
            .accounts({
              admin: rogue.publicKey,
              config: configPda,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([rogue])
            .rpc();
          assert.fail("Should have thrown Unauthorised");
        } catch (err: any) {
          assert.ok(err, "Expected error for unauthorized pause");
        }
      });

      it("non-admin cannot unpause mint (Unauthorised)", async () => {
        // First pause legitimately
        await program.methods
          .pauseMint()
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        try {
          await program.methods
            .unpauseMint()
            .accounts({
              admin: rogue.publicKey,
              config: configPda,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([rogue])
            .rpc();
          assert.fail("Should have thrown Unauthorised");
        } catch (err: any) {
          assert.ok(err, "Expected error for unauthorized unpause");
        } finally {
          // Restore
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
      });
    });
  });

  // ── MINT TOKENS ────────────────────────────────────────────────────────────
  describe("MINT TOKENS", async () => {
    const mintAmount = new anchor.BN(500_000); // within the 2_000_000 allowance

    describe("Happy cases", async () => {
      it("minter can mint tokens to a user when unpaused", async () => {
        const [minterConfigPda] = deriveMinterConfig(
          minter.publicKey,
          programId,
        );
        const userAta = getAssociatedTokenAddressSync(
          mintPda,
          user.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        await program.methods
          .mintTokens(mintAmount)
          .accounts({
            minter: minter.publicKey,
            config: configPda,
            minterConfig: minterConfigPda,
            mint: mintPda,
            user: user.publicKey,
            userAta,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([minter])
          .rpc();

        const mc = await program.account.minterConfig.fetch(minterConfigPda);
        assert.ok(
          mc.totalMinted.eq(mintAmount),
          "total_minted should equal minted amount",
        );
      });

      it("minter can mint multiple times up to the allowance", async () => {
        const [minterConfigPda] = deriveMinterConfig(
          minter.publicKey,
          programId,
        );
        const mcBefore = await program.account.minterConfig.fetch(
          minterConfigPda,
        );
        const remaining = mcBefore.allowance.sub(mcBefore.totalMinted);

        // Use a fresh user so the ATA doesn't already exist
        const user2 = anchor.web3.Keypair.generate();
        await airdrop(provider.connection, user2.publicKey);

        const user2Ata = getAssociatedTokenAddressSync(
          mintPda,
          user2.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        await program.methods
          .mintTokens(remaining)
          .accounts({
            minter: minter.publicKey,
            config: configPda,
            minterConfig: minterConfigPda,
            mint: mintPda,
            user: user2.publicKey,
            userAta: user2Ata,
            tokenProgram: TOKEN_2022_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([minter])
          .rpc();

        const mcAfter = await program.account.minterConfig.fetch(
          minterConfigPda,
        );
        assert.ok(
          mcAfter.totalMinted.eq(mcBefore.allowance),
          "should have reached full allowance",
        );
      });
    });

    describe("Failure cases", async () => {
      before(async () => {
        await airdrop(
          provider.connection,
          minter2.publicKey,
          10 * LAMPORTS_PER_SOL,
        );
        await airdrop(
          provider.connection,
          user3.publicKey,
          10 * LAMPORTS_PER_SOL,
        );
        await airdrop(
          provider.connection,
          user4.publicKey,
          10 * LAMPORTS_PER_SOL,
        );
        await airdrop(provider.connection, fakeMinter.publicKey);
        await airdrop(provider.connection, user5.publicKey);
      });

      it("minting fails when contract is paused (MintingPaused)", async () => {
        await program.methods
          .pauseMint()
          .accounts({
            admin: admin.publicKey,
            config: configPda,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([admin])
          .rpc();

        const [minterConfigPda] = deriveMinterConfig(
          minter2.publicKey,
          programId,
        );

        const user3Ata = getAssociatedTokenAddressSync(
          mintPda,
          user3.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        try {
          await program.methods
            .mintTokens(new anchor.BN(100))
            .accounts({
              minter: minter2.publicKey,
              config: configPda,
              minterConfig: minterConfigPda,
              mint: mintPda,
              user: user3.publicKey,
              userAta: user3Ata,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([minter2])
            .rpc();
          assert.fail("Should have thrown MintingPaused");
        } catch (err: any) {
          const anchorErr = err as anchor.AnchorError;
          const msg = anchorErr.error?.errorMessage ?? err.message;
          assert.ok(
            msg.includes("Minting paused"),
            `Expected MintingPaused error, got: ${msg}`,
          );
        } finally {
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
      });

      it("minting fails when amount exceeds remaining allowance (AllowanceExceeded)", async () => {
        const [minterConfigPda] = deriveMinterConfig(
          minter.publicKey,
          programId,
        );

        const user4Ata = getAssociatedTokenAddressSync(
          mintPda,
          user4.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        try {
          await program.methods
            .mintTokens(new anchor.BN(1))
            .accounts({
              minter: minter.publicKey,
              config: configPda,
              minterConfig: minterConfigPda,
              mint: mintPda,
              user: user4.publicKey,
              userAta: user4Ata,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([minter])
            .rpc();
          assert.fail(
            "Should have thrown AllowanceExceeded or InsufficientBalance",
          );
        } catch (err: any) {
          const msg =
            (err as anchor.AnchorError).error?.errorMessage ?? err.message;
          const isExpectedError =
            msg.includes("Allowance exceeded") ||
            msg.includes("Insufficient balance");
          assert.ok(isExpectedError, `Unexpected error: ${msg}`);
        }
      });

      it("unconfigured minter cannot mint tokens", async () => {
        const [fakeMinterConfigPda] = deriveMinterConfig(
          fakeMinter.publicKey,
          programId,
        );

        const user5Ata = getAssociatedTokenAddressSync(
          mintPda,
          user5.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        try {
          await program.methods
            .mintTokens(new anchor.BN(100))
            .accounts({
              minter: fakeMinter.publicKey,
              config: configPda,
              minterConfig: fakeMinterConfigPda,
              mint: mintPda,
              user: user5.publicKey,
              userAta: user5Ata,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
              associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
              systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([fakeMinter])
            .rpc();
          assert.fail("Should have thrown for unconfigured minter");
        } catch (err: any) {
          assert.ok(err, "Expected error for unconfigured minter");
        }
      });
    });
  });

  // ── BURN TOKENS ────────────────────────────────────────────────────────────
  describe("BURN TOKENS", () => {
    describe("Happy cases", () => {
      it("token holder can burn their tokens", async () => {
        const userAta = getAssociatedTokenAddressSync(
          mintPda,
          user.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        const balBefore = await provider.connection.getTokenAccountBalance(
          userAta,
        );
        const burnAmount = new anchor.BN(100_000);

        try {
          await program.methods
            .burnTokens(burnAmount)
            .accounts({
              owner: user.publicKey,
              config: configPda,
              mint: mintPda,
              ownerAta: userAta,
              tokenProgram: TOKEN_2022_PROGRAM_ID,
            })
            .signers([user])
            .rpc();
        } catch (err: any) {
          throw err;
        }

        const balAfter = await provider.connection.getTokenAccountBalance(
          userAta,
        );
        const expectedBalance = new anchor.BN(balBefore.value.amount).sub(
          burnAmount,
        );
        assert.ok(
          new anchor.BN(balAfter.value.amount).eq(expectedBalance),
          "balance should decrease by burn amount",
        );
      });

      it("burning all remaining tokens reduces balance to zero", async () => {
        const userAta = getAssociatedTokenAddressSync(
          mintPda,
          user.publicKey,
          false,
          TOKEN_2022_PROGRAM_ID,
        );

        const balInfo = await provider.connection.getTokenAccountBalance(
          userAta,
        );
        const remaining = new anchor.BN(balInfo.value.amount);
        // console.log(`\n[burn_all] remaining balance: ${remaining.toString()}`);

        if (remaining.gtn(0)) {
          try {
            await program.methods
              .burnTokens(remaining)
              .accounts({
                owner: user.publicKey,
                config: configPda,
                mint: mintPda,
                ownerAta: userAta,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
              })
              .signers([user])
              .rpc();
          } catch (err: any) {
            // const logs = await getLogs(provider.connection, err);
            // console.log("\n[burn_all] Error logs:\n", logs.join("\n"));
            throw err;
          }

          const balAfter = await provider.connection.getTokenAccountBalance(
            userAta,
          );
          // console.log(`\n[burn_all] balance after: ${balAfter.value.amount}`);
          assert.strictEqual(
            balAfter.value.amount,
            "0",
            "balance should be zero after full burn",
          );
        }
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

async function logBalances(
  connection: any,
  label: string,
  accounts: { name: string; pubkey: PublicKey }[],
) {
  console.log(`\n── Balances [${label}] ──`);
  for (const { name, pubkey } of accounts) {
    const bal = await connection.getBalance(pubkey);
    console.log(
      `  ${name}: ${bal / LAMPORTS_PER_SOL} SOL  (${pubkey.toBase58()})`,
    );
  }
}

async function logTokenBalance(connection: any, label: string, ata: PublicKey) {
  try {
    const bal = await connection.getTokenAccountBalance(ata);
    console.log(`  [Token] ${label}: ${bal.value.amount} (${ata.toBase58()})`);
  } catch {
    console.log(
      `  [Token] ${label}: ATA does not exist yet (${ata.toBase58()})`,
    );
  }
}

async function getLogs(connection: any, err: any): Promise<string[]> {
  if (err?.logs) return err.logs;
  try {
    return (await err.getLogs?.()) ?? [];
  } catch {
    return [];
  }
}
