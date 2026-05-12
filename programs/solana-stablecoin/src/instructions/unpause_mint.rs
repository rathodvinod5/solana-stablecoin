use anchor_lang::prelude::*;

use crate::{
    errors::StableCoinError,
    states::Config,
};

pub fn unpause_mint(ctx: Context<UnPauseMint>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.is_paused = false;
    msg!("Stablecoin unpaused");
    
    Ok(())
}

#[derive(Accounts)]
pub struct UnPauseMint<'info> {
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