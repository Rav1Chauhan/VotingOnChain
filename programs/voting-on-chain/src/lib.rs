use anchor_lang::prelude::*;

declare_id!("6fDL4DShGriVMZy4pFQUhieLLnUEzmedmwXrcXVwk7Vm");

#[program]
pub mod voting_on_chain {
    use super::*;

    pub fn init_poll(
        ctx: Context<InitPoll>,
        _poll_id: u64,
        start: i64,
        end: i64,
        name: String,
        description: String,
    ) -> Result<()> {
        require!(start < end, ErrorCode::InvalidTimeRange);
        require!(name.len() <= 32, ErrorCode::NameTooLong);
        require!(description.len() <= 280, ErrorCode::DescriptionTooLong);

        let poll = &mut ctx.accounts.poll_account;
        poll.poll_name = name;
        poll.poll_description = description;
        poll.poll_voting_start = start;
        poll.poll_voting_end = end;
        poll.poll_option_index = 0;
        Ok(())
    }

    pub fn initialize_candidate(
        ctx: Context<InitializeCandidate>,
        _poll_id: u64,
        candidate: String,
    ) -> Result<()> {
        require!(candidate.len() <= 32, ErrorCode::NameTooLong);

        ctx.accounts.candidate_account.candidate_name = candidate;
        ctx.accounts.candidate_account.candidate_votes = 0;

        let poll = &mut ctx.accounts.poll_account;
        poll.poll_option_index = poll
            .poll_option_index
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;
        Ok(())
    }

    pub fn vote(ctx: Context<Vote>, _poll_id: u64, _candidate: String) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let poll = &ctx.accounts.poll_account;

        require!(now >= poll.poll_voting_start, ErrorCode::VotingNotStarted);
        require!(now <= poll.poll_voting_end, ErrorCode::VotingEnded);

        let candidate = &mut ctx.accounts.candidate_account;
        candidate.candidate_votes = candidate
            .candidate_votes
            .checked_add(1)
            .ok_or(ErrorCode::Overflow)?;

        // voter_record is created via `init`, so a second vote by the
        // same wallet on the same poll fails automatically.
        ctx.accounts.voter_record.voter = ctx.accounts.signer.key();
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(poll_id: u64)]
pub struct InitPoll<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        init,
        payer = signer,
        space = 8 + PollAccount::INIT_SPACE,
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump
    )]
    pub poll_account: Account<'info, PollAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(poll_id: u64, candidate: String)]
pub struct InitializeCandidate<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump
    )]
    pub poll_account: Account<'info, PollAccount>,

    #[account(
        init,
        payer = signer,
        space = 8 + CandidateAccount::INIT_SPACE,
        seeds = [poll_id.to_le_bytes().as_ref(), candidate.as_bytes()],
        bump
    )]
    pub candidate_account: Account<'info, CandidateAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(poll_id: u64, candidate: String)]
pub struct Vote<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        seeds = [b"poll", poll_id.to_le_bytes().as_ref()],
        bump
    )]
    pub poll_account: Account<'info, PollAccount>,

    #[account(
        mut,
        seeds = [poll_id.to_le_bytes().as_ref(), candidate.as_bytes()],
        bump
    )]
    pub candidate_account: Account<'info, CandidateAccount>,

    #[account(
        init,
        payer = signer,
        space = 8 + VoterRecord::INIT_SPACE,
        seeds = [b"voter", poll_id.to_le_bytes().as_ref(), signer.key().as_ref()],
        bump
    )]
    pub voter_record: Account<'info, VoterRecord>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct PollAccount {
    #[max_len(32)]
    pub poll_name: String,
    #[max_len(280)]
    pub poll_description: String,
    pub poll_voting_start: i64,
    pub poll_voting_end: i64,
    pub poll_option_index: u64,
}

#[account]
#[derive(InitSpace)]
pub struct CandidateAccount {
    #[max_len(32)]
    pub candidate_name: String,
    pub candidate_votes: u64,
}

#[account]
#[derive(InitSpace)]
pub struct VoterRecord {
    pub voter: Pubkey,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Voting has not started yet")]
    VotingNotStarted,
    #[msg("Voting has ended")]
    VotingEnded,
    #[msg("Start time must be before end time")]
    InvalidTimeRange,
    #[msg("Name is too long")]
    NameTooLong,
    #[msg("Description is too long")]
    DescriptionTooLong,
    #[msg("Arithmetic overflow")]
    Overflow,
}
