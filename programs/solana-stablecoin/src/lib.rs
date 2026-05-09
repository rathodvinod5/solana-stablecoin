use anchor_lang::prelude::*;

pub mod instructions;
pub use instruction::*;

pub mod states;
pub mod errors;

declare_id!("45iBU1QvfiQ9HakZfGMx2T4s6RZtcRawycdX66xTRxcX");

#[program]
pub mod solana_stablecoin {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
