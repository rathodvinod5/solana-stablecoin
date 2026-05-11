use anchor_lang::prelude::*;

use crate::{ 
    errors::{self, StableCoinError}, 
    states::{self, Config, MinterConfig} 
};

pub fn remover_minter(ctx: Context<RemoveMinter>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct RemoveMinter<'info> {
    #[account(
        mut,
        constraint = config.admin == admin.key() @ StableCoinError::Unauthorised
    )]
    pub admin: Signer<'info>,

    /// CHECK: minter being removed
    #[account(mut)]
    pub minter: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"config"],
        bump = config.config_bump        
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        close = admin,
        seeds = [b"minter", minter.key().as_ref()],
        bump = minter_config.bump
    )]
    pub minter_config: Account<'info, MinterConfig>
}