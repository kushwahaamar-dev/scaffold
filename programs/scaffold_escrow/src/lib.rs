use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("4dUWewdZ6q1wXD8YxLJFrhWqqp6Gnk7TrXSD8WqDAMnG");

pub const MAX_CHECKPOINTS: usize = 16;
pub const BPS_DENOM: u128 = 10_000;

#[program]
pub mod scaffold_escrow {
    use super::*;

    pub fn initialize_escrow(
        ctx: Context<InitializeEscrow>,
        nonce: u64,
        budget: u64,
        checkpoint_count: u8,
        weights: [u16; MAX_CHECKPOINTS],
        deadline_unix: i64,
        quality_threshold_bps: u16,
        spec_hash: [u8; 32],
    ) -> Result<()> {
        require!(
            checkpoint_count > 0 && checkpoint_count as usize <= MAX_CHECKPOINTS,
            EscrowError::BadCheckpointCount
        );
        require!(budget > 0, EscrowError::ZeroBudget);
        require!(quality_threshold_bps as u128 <= BPS_DENOM, EscrowError::BadThreshold);

        let mut sum: u32 = 0;
        for i in 0..checkpoint_count as usize {
            sum += weights[i] as u32;
        }
        require!(sum == BPS_DENOM as u32, EscrowError::WeightsMustBe10000Bps);

        let escrow = &mut ctx.accounts.escrow;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.worker = ctx.accounts.worker.key();
        escrow.arbiter = ctx.accounts.arbiter.key();
        escrow.mint = ctx.accounts.mint.key();
        escrow.bump = ctx.bumps.escrow;
        escrow.nonce = nonce;
        escrow.budget = budget;
        escrow.released = 0;
        escrow.checkpoint_count = checkpoint_count;
        escrow.weights = weights;
        escrow.bps_released_per_cp = [0u16; MAX_CHECKPOINTS];
        escrow.deposited = false;
        escrow.paused = false;
        escrow.finalized = false;
        escrow.deadline_unix = deadline_unix;
        escrow.quality_threshold_bps = quality_threshold_bps;
        escrow.spec_hash = spec_hash;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(!escrow.deposited, EscrowError::AlreadyDeposited);
        require!(!escrow.finalized, EscrowError::Finalized);

        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_ata.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.buyer.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
        token::transfer(cpi_ctx, escrow.budget)?;

        escrow.deposited = true;
        Ok(())
    }

    /// Streaming-style release. The arbiter posts a per-checkpoint score in
    /// basis points (0..=weight). New release = (score - already_released) for
    /// that checkpoint, scaled by budget. Repeated calls accumulate up to the
    /// checkpoint weight ceiling.
    pub fn release_streamed(
        ctx: Context<ReleaseStreamed>,
        checkpoint_index: u8,
        score_bps: u16,
    ) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require_keys_eq!(
            ctx.accounts.arbiter.key(),
            escrow.arbiter,
            EscrowError::UnauthorizedArbiter
        );
        require!(escrow.deposited, EscrowError::NotFunded);
        require!(!escrow.paused, EscrowError::Paused);
        require!(!escrow.finalized, EscrowError::Finalized);
        require!(
            checkpoint_index < escrow.checkpoint_count,
            EscrowError::BadCheckpointIndex
        );
        require_keys_eq!(
            ctx.accounts.worker.key(),
            escrow.worker,
            EscrowError::WrongWorker
        );

        let idx = checkpoint_index as usize;
        let weight = escrow.weights[idx];
        let already = escrow.bps_released_per_cp[idx];
        let target = score_bps.min(weight);
        require!(target > already, EscrowError::NoForwardProgress);

        let delta_bps = (target - already) as u128;
        let amount_u128 = (escrow.budget as u128)
            .checked_mul(delta_bps)
            .ok_or(EscrowError::Overflow)?
            .checked_div(BPS_DENOM)
            .ok_or(EscrowError::Overflow)?;
        let amount: u64 = amount_u128
            .try_into()
            .map_err(|_| error!(EscrowError::Overflow))?;
        require!(amount > 0, EscrowError::ZeroRelease);

        let buyer_key = escrow.buyer;
        let nonce_bytes = escrow.nonce.to_le_bytes();
        let bump = escrow.bump;
        let signer_seeds: &[&[u8]] = &[b"escrow", buyer_key.as_ref(), nonce_bytes.as_ref(), &[bump]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.worker_ata.to_account_info(),
            authority: escrow.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[signer_seeds],
            ),
            amount,
        )?;

        escrow.bps_released_per_cp[idx] = target;
        escrow.released = escrow.released.checked_add(amount).ok_or(EscrowError::Overflow)?;
        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, paused: bool) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require_keys_eq!(
            ctx.accounts.arbiter.key(),
            escrow.arbiter,
            EscrowError::UnauthorizedArbiter
        );
        require!(!escrow.finalized, EscrowError::Finalized);
        escrow.paused = paused;
        Ok(())
    }

    pub fn refund_buyer(ctx: Context<RefundBuyer>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.deposited, EscrowError::NotFunded);
        require!(!escrow.finalized, EscrowError::Finalized);
        let now = Clock::get()?.unix_timestamp;
        require!(
            escrow.paused || now >= escrow.deadline_unix,
            EscrowError::NotRefundable
        );

        let vault_balance = ctx.accounts.vault.amount;
        if vault_balance == 0 {
            return Ok(());
        }

        let buyer_key = escrow.buyer;
        let nonce_bytes = escrow.nonce.to_le_bytes();
        let bump = escrow.bump;
        let signer_seeds: &[&[u8]] = &[b"escrow", buyer_key.as_ref(), nonce_bytes.as_ref(), &[bump]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.buyer_ata.to_account_info(),
            authority: escrow.to_account_info(),
        };
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                cpi_accounts,
                &[signer_seeds],
            ),
            vault_balance,
        )?;
        Ok(())
    }

    /// Once the deadline has passed or all checkpoints have been fully scored,
    /// finalize routes the vault remainder. If quality (sum bps released) hits
    /// the threshold, the surplus stays with the worker; otherwise it returns
    /// to the buyer. Anyone can crank this — outcome is fully determined by
    /// on-chain state.
    pub fn finalize_job(ctx: Context<FinalizeJob>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(escrow.deposited, EscrowError::NotFunded);
        require!(!escrow.finalized, EscrowError::Finalized);

        let now = Clock::get()?.unix_timestamp;
        let total_bps_released: u32 = escrow.bps_released_per_cp[..escrow.checkpoint_count as usize]
            .iter()
            .map(|x| *x as u32)
            .sum();
        let fully_scored = total_bps_released as u128 == BPS_DENOM;
        require!(
            now >= escrow.deadline_unix || fully_scored,
            EscrowError::DeadlineNotReached
        );

        let vault_balance = ctx.accounts.vault.amount;
        let pays_worker = total_bps_released as u16 >= escrow.quality_threshold_bps;

        if vault_balance > 0 {
            let buyer_key = escrow.buyer;
            let nonce_bytes = escrow.nonce.to_le_bytes();
            let bump = escrow.bump;
            let signer_seeds: &[&[u8]] = &[b"escrow", buyer_key.as_ref(), nonce_bytes.as_ref(), &[bump]];

            let dest = if pays_worker {
                ctx.accounts.worker_ata.to_account_info()
            } else {
                ctx.accounts.buyer_ata.to_account_info()
            };

            require_keys_eq!(
                ctx.accounts.worker.key(),
                escrow.worker,
                EscrowError::WrongWorker
            );

            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: dest,
                authority: escrow.to_account_info(),
            };
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    cpi_accounts,
                    &[signer_seeds],
                ),
                vault_balance,
            )?;

            if pays_worker {
                escrow.released = escrow
                    .released
                    .checked_add(vault_balance)
                    .ok_or(EscrowError::Overflow)?;
            }
        }

        escrow.finalized = true;
        Ok(())
    }
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    pub buyer: Pubkey,
    pub worker: Pubkey,
    pub arbiter: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
    pub nonce: u64,
    pub budget: u64,
    pub released: u64,
    pub checkpoint_count: u8,
    pub weights: [u16; MAX_CHECKPOINTS],
    pub bps_released_per_cp: [u16; MAX_CHECKPOINTS],
    pub deposited: bool,
    pub paused: bool,
    pub finalized: bool,
    pub deadline_unix: i64,
    pub quality_threshold_bps: u16,
    pub spec_hash: [u8; 32],
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct InitializeEscrow<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    /// CHECK: worker receives streamed tokens
    pub worker: UncheckedAccount<'info>,
    /// CHECK: signer authorized to release checkpoints & pause (demo: AI judge / ops key)
    pub arbiter: UncheckedAccount<'info>,
    pub mint: Account<'info, Mint>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", buyer.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        init,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = escrow,
        associated_token::token_program = token_program,
    )]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", buyer.key().as_ref(), &escrow.nonce.to_le_bytes()],
        bump = escrow.bump,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_ata: Account<'info, TokenAccount>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReleaseStreamed<'info> {
    #[account(mut)]
    pub arbiter: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), &escrow.nonce.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: must match escrow.worker
    pub worker: UncheckedAccount<'info>,
    #[account(mut, token::mint = mint, token::authority = worker)]
    pub worker_ata: Account<'info, TokenAccount>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(mut)]
    pub arbiter: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), &escrow.nonce.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
}

#[derive(Accounts)]
pub struct RefundBuyer<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", buyer.key().as_ref(), &escrow.nonce.to_le_bytes()],
        bump = escrow.bump,
        has_one = buyer,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_ata: Account<'info, TokenAccount>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct FinalizeJob<'info> {
    /// Anyone can crank finalize; the outcome is determined by on-chain state.
    #[account(mut)]
    pub cranker: Signer<'info>,
    #[account(
        mut,
        seeds = [b"escrow", escrow.buyer.as_ref(), &escrow.nonce.to_le_bytes()],
        bump = escrow.bump,
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, token::mint = mint, token::authority = escrow)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: must match escrow.worker
    pub worker: UncheckedAccount<'info>,
    #[account(mut, token::mint = mint, token::authority = worker)]
    pub worker_ata: Account<'info, TokenAccount>,
    #[account(mut, token::mint = mint, token::authority = escrow.buyer)]
    pub buyer_ata: Account<'info, TokenAccount>,
    #[account(address = escrow.mint)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Checkpoint count must be 1..=16")]
    BadCheckpointCount,
    #[msg("Budget must be positive")]
    ZeroBudget,
    #[msg("Weights for active checkpoints must sum to 10000 basis points")]
    WeightsMustBe10000Bps,
    #[msg("Quality threshold must be in 0..=10000 bps")]
    BadThreshold,
    #[msg("Escrow already funded")]
    AlreadyDeposited,
    #[msg("Buyer must fund escrow first")]
    NotFunded,
    #[msg("Streaming is paused")]
    Paused,
    #[msg("Job already finalized")]
    Finalized,
    #[msg("Invalid checkpoint index")]
    BadCheckpointIndex,
    #[msg("Score must exceed previously released bps for this checkpoint")]
    NoForwardProgress,
    #[msg("Only the designated arbiter may execute this instruction")]
    UnauthorizedArbiter,
    #[msg("Worker pubkey does not match escrow")]
    WrongWorker,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Release amount rounded to zero")]
    ZeroRelease,
    #[msg("Refund only allowed while paused or after deadline")]
    NotRefundable,
    #[msg("Cannot finalize before deadline unless fully scored")]
    DeadlineNotReached,
}
