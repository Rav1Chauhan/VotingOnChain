# VotingOnChain

A decentralized voting program on Solana, built with [Anchor](https://www.anchor-lang.com/). Anyone can create a poll, add candidates, and cast one vote per wallet. All state lives on-chain in program-derived accounts (PDAs).

**Program ID:** `6fDL4DShGriVMZy4pFQUhieLLnUEzmedmwXrcXVwk7Vm`

## Features

- Create polls with a name, description, and voting window (start and end timestamps)
- Add candidates to a poll
- Vote for a candidate only while the voting window is open
- One vote per wallet per poll, enforced by a per-voter PDA
- Checked arithmetic and input validation (time range, string lengths)

## How it works

### Instructions

| Instruction | Arguments | Description |
|---|---|---|
| `init_poll` | `poll_id: u64`, `start: i64`, `end: i64`, `name: String`, `description: String` | Creates a poll account. Requires `start < end`, name up to 32 bytes, description up to 280 bytes. |
| `initialize_candidate` | `poll_id: u64`, `candidate: String` | Creates a candidate account for a poll and increments the poll's candidate count. Name up to 32 bytes. |
| `vote` | `poll_id: u64`, `candidate: String` | Adds one vote to the candidate if the current time is within `[start, end]`. Fails if the wallet has already voted in this poll. |

### Accounts and PDA seeds

| Account | Seeds | Fields |
|---|---|---|
| `PollAccount` | `["poll", poll_id (u64, LE)]` | `poll_name`, `poll_description`, `poll_voting_start`, `poll_voting_end`, `poll_option_index` |
| `CandidateAccount` | `[poll_id (u64, LE), candidate_name]` | `candidate_name`, `candidate_votes` |
| `VoterRecord` | `["voter", poll_id (u64, LE), voter_pubkey]` | `voter` |

Because `VoterRecord` is created with `init`, a second vote from the same wallet on the same poll fails automatically.

### Errors

| Error | Meaning |
|---|---|
| `VotingNotStarted` | Current time is before the poll's start time |
| `VotingEnded` | Current time is after the poll's end time |
| `InvalidTimeRange` | `start` is not before `end` |
| `NameTooLong` | Poll or candidate name exceeds 32 bytes |
| `DescriptionTooLong` | Description exceeds 280 bytes |
| `Overflow` | Arithmetic overflow |

## Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Solana CLI](https://docs.solanalabs.com/cli/install)
- [Anchor CLI](https://www.anchor-lang.com/docs/installation)
- Node.js and Yarn (only if you use TypeScript tests or a client)

## Getting started

```bash
git clone https://github.com/Rav1Chauhan/VotingOnChain.git
cd VotingOnChain

# Build the program and generate the IDL
anchor build

# Run tests
anchor test
```

### Deploy to devnet

```bash
solana config set --url devnet
solana airdrop 2
anchor deploy
```

If you generate a new program keypair, run `anchor keys sync` so `declare_id!` and `Anchor.toml` match.

## Project structure

```
.
├── Anchor.toml
├── Cargo.toml
├── programs/
│   └── voting-on-chain/
│       ├── src/lib.rs      # Program logic, accounts, errors
│       └── tests/          # Tests
└── target/                 # Build output and IDL (generated)
```

## Usage example (TypeScript)

```ts
const pollId = new anchor.BN(1);

const [pollPda] = anchor.web3.PublicKey.findProgramAddressSync(
  [Buffer.from("poll"), pollId.toArrayLike(Buffer, "le", 8)],
  program.programId
);

await program.methods
  .initPoll(
    pollId,
    new anchor.BN(Math.floor(Date.now() / 1000)),        // start
    new anchor.BN(Math.floor(Date.now() / 1000) + 3600), // end
    "Best language",
    "Pick your favorite"
  )
  .accounts({ pollAccount: pollPda })
  .rpc();
```

## Known limitations and ideas

- Anyone can create a poll or add candidates. Add an `authority` field and `has_one` constraint to restrict this.
- Candidates can be added after voting has started. Consider requiring `now < poll_voting_start`.
- Votes are public on-chain; this program does not provide ballot secrecy.

## Contributing

Issues and pull requests are welcome. Please open an issue first to discuss major changes.

## License

Add a license of your choice (for example, MIT) and reference it here.
