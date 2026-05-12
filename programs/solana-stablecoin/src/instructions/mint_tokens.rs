use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken, 
    // token::MintTo, 
    token_2022::{
        Token2022, mint_to, MintTo
    }, 
    token_interface::{
        Mint, TokenAccount
    }
};

use crate::{
    errors:: { StableCoinError},
    states::{ Config, MinterConfig }
};


pub fn mint_tokens(ctx: Context<MintTokens>, amount: u64) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let minter_config = &mut ctx.accounts.minter_config;

    require!(config.is_paused, StableCoinError::MintingPaused);

    let amount_remaining = minter_config.allowance.checked_sub(minter_config.total_minted)
        .ok_or(StableCoinError::AllowanceExceeded)?;

    require!(amount <= amount_remaining, StableCoinError::InsufficientBalance);

    minter_config.total_minted = minter_config.total_minted.checked_add(amount)
        .ok_or(StableCoinError::MathOverflow)?;

    let cpi_accounts = MintTo {
        mint: ctx.accounts.mint.to_account_info(),
        to: ctx.accounts.user_ata.to_account_info(),
        authority: config.to_account_info(),
    };
    let signer_seeds: &[&[&[u8]]] = &[&[b"config", &[config.config_bump]]];

    let cpi_context = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts, 
        signer_seeds
    );

    let _ = mint_to(cpi_context, amount)?;

    msg!("Token minted to user: {:?}", &ctx.accounts.user);

    Ok(())
}


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

