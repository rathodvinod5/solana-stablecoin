use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub is_paused: bool,
    pub config_bump: u8,
    pub mint_bump: u8
}