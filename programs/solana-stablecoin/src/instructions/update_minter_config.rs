use anchor_lang::prelude::*;

use crate::{
    errors::StableCoinError, 
    states::{ 
        Config, MinterConfig 
    }
};

pub fn update_minter_config(ctx: Context<UpdateMinterConfig>, udpated_allowance: u64) -> Result<()> {
    let minter_config = &mut ctx.accounts.minter_config;
    minter_config.allowance = udpated_allowance;
    
    Ok(())
}


#[derive(Accounts)]
pub struct UpdateMinterConfig<'info> {
    #[account(
        mut,
        constraint = config.admin == admin.key() @ StableCoinError::Unauthorised
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        has_one = admin
    )]
    pub config: Account<'info, Config>,

    #[account(
        mut,
        constraint = minter_config.is_initialized == true @ StableCoinError::UninitilizedMinter
    )]
    pub minter_config: Account<'info, MinterConfig>,

    pub system_program: Program<'info, System>
}