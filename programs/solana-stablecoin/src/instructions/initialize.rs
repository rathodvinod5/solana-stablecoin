use anchor_lang::prelude::*;
// use anchor_spl::{token_2022::Token2022, token_interface::Mint};

use anchor_spl::{
    // token::{ Mint, Token }, 
    token_2022::Token2022,
    token_interface:: { Mint }
};

use crate::{ states::Config };


pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.mint = ctx.accounts.mint.key();
    config.is_paused = false;
    config.config_bump = ctx.bumps.config;
    config.mint_bump = ctx.bumps.mint;

    Ok(())
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,

    #[account(
        init,
        payer = admin,
        mint::decimals = 6,
        mint::authority = config,
        mint::freeze_authority = config,
        seeds = [b"mint"],
        bump
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>
}