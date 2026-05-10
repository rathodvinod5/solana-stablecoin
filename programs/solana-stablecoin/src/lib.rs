use anchor_lang::prelude::*;

pub mod instructions;
use instructions::*;

pub mod states;
pub mod errors;

declare_id!("45iBU1QvfiQ9HakZfGMx2T4s6RZtcRawycdX66xTRxcX");

#[program]
pub mod solana_stablecoin {

use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let _ = instructions::initialize(ctx)?;
        Ok(())
    }
}
