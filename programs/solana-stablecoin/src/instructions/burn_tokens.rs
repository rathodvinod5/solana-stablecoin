use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,  token_2022::{burn, Burn, Token2022}, token_interface::{
        Mint, TokenAccount
    }
};

use crate::states::Config;

pub fn burn_tokens(ctx: Context<BurnTokens>, amount: u64) -> Result<()> {

    let burn_accounts = Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.owner_ata.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let burn_cpi_context = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        burn_accounts
    );

    let _ = burn(burn_cpi_context, amount)?;

    msg!("Burned {} tokens from {}", amount, ctx.accounts.owner_ata.key());

    Ok(())
}


#[derive(Accounts)]
pub struct BurnTokens<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        has_one = mint,
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