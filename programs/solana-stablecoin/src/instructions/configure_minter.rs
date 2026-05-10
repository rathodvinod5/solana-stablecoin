use anchor_lang::prelude::*;

use crate::{
    errors::StableCoinError, 
    states::{ Config, MinterConfig }
};

pub fn configure_minter(ctx: Context<ConfigureMinter>, allowance: u64) -> Result<()> {
    let minter = &ctx.accounts.minter;
    let minter_config = &mut ctx.accounts.minter_config;

    minter_config.set_inner(MinterConfig { 
        minter: minter.key(), 
        allowance, 
        amount_minted: 0, 
        is_initialized: true, 
        bump: ctx.bumps.minter_config
    });

    msg!("Configured minter {} with allowance {}", minter.key(), allowance);
    
    Ok(())
}

#[derive(Accounts)]
pub struct ConfigureMinter<'info> {
    #[account(
        mut,
        constraint = admin.key() == config.admin @ StableCoinError::Unauthorised
    )]
    pub admin: Signer<'info>,

    /// CHECK: minter could be any account
    pub minter: UncheckedAccount<'info>,

    #[account(
        mut,
        has_one = admin,
        seeds = [b"config"],
        bump = config.config_bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        space = 8 + MinterConfig::INIT_SPACE,
        seeds = [b"minter", minter.key().as_ref()],
        bump
    )]
    pub minter_config: Account<'info, MinterConfig>,

    pub system_program: Program<'info, System>
}