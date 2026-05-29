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
}
