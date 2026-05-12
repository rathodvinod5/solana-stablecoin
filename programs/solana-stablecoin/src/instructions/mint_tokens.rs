use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, 
    // token::Mint, 
    token_2022::{ Token2022 }, 
    token_interface::{Mint, TokenAccount}
};

use crate::{
    errors:: { StableCoinError},
    states::{ Config, MinterConfig }
};



#[derive(Accounts)]
pub struct MintTokens<'info> {
    #[account(mut)]
    pub minter: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.config_bump,
        has_one = mint
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"minter", minter.key().as_ref()],
        bump = minter_config.bump
    )]
    pub minter_config: Account<'info, MinterConfig>,

    #[account(
        mut,
        seeds = [b"mint"],
        bump = config.mint_bump
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: user address who is being minted to
    #[account(mut)]
    pub user: UncheckedAccount<'info>,

    #[account(
        init,
        payer = minter,
        associated_token::mint = mint,
        associated_token::authority = user,
        associated_token::token_program = token_program
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>
}

