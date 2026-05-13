use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, token_2022::Token2022, token_interface::{
        Mint, TokenAccount
    }
};

use crate::states::Config;


#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        // mut,
        seeds = [b"config"],
        bump = config.config_bump,
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        seeds = [b"mint"],
        bump = config.mint_bump
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = owner,
        associated_token::token_program = token_program
    )]
    pub owner_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>
}