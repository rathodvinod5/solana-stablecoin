use anchor_lang::prelude::*;

use crate::{
    errors::StableCoinError,
    states::Config,
};

pub fn pause_mint(ctx: Context<PauseMint>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.is_paused = true;
    msg!("Stablecoin paused");
    
    Ok(())
}

#[derive(Accounts)]
pub struct PauseMint<'info> {
    #[account(
        mut,
        constraint = config.admin == admin.key() @ StableCoinError::Unauthorised
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"config"],
        bump = config.config_bump
    )]
    pub config: Account<'info, Config>,

    pub system_program: Program<'info, System>
}