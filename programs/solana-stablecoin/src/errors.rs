use anchor_lang::prelude::*;

#[error_code]
pub enum StableCoinError {
    #[msg("Not the owner")]
    NotTheOwner,
    #[msg("Insufficient balance")]
    InsufficientBalance,
    #[msg("Unauthorised")]
    Unauthorised,
    #[msg("Minter not initialized")]
    UninitilizedMinter,
    #[msg("Minting paused")]
    MintingPaused,
    #[msg("Allowance exceeded")]
    AllowanceExceeded,
    #[msg("Math overflow")]
    MathOverflow
}