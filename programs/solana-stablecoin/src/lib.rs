use anchor_lang::prelude::*;

pub mod instructions;
use instructions::*;

pub mod states;
pub mod errors;

declare_id!("138UJ48r75UFpHw5Gb73ma6k8sUqJiRMFsraQqw6jyid");

#[program]
pub mod solana_stablecoin {

use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let _ = instructions::initialize(ctx)?;
        Ok(())
    }

    pub fn configure_minter(ctx: Context<ConfigureMinter>, allowance: u64) -> Result<()> {
        let _ = instructions::configure_minter(ctx, allowance)?;
        Ok(())
    }

    pub fn update_minter_config(ctx: Context<UpdateMinterConfig>, updated_allowance: u64) -> Result<()> {
        let _ = instructions::update_minter_config(ctx, updated_allowance)?;
        Ok(())
    }

    pub fn pause_mint(ctx: Context<PauseMint>) -> Result<()> {
        let _ = instructions::pause_mint(ctx)?;
        Ok(())
    }

    pub fn unpause_mint(ctx: Context<UnPauseMint>) -> Result<()> {
        let _ = instructions::unpause_mint(ctx)?;
        Ok(())
    }

    pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
        let _ = instructions::mint_tokens(ctx, amount)?;
        Ok(())
    }

    pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {
        let _ = instructions::burn_tokens(ctx, amount);
        Ok(())
    }
}
