use anchor_lang::prelude::*;

#[error_code]
pub enum StableCoinError {
    #[msg("Not the owner")]
    NotTheOwner,
    #[msg("Insufficient balance")]
    InsufficientBalance
}