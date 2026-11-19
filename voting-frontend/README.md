# VotingOnChain frontend

React + Vite client for the Anchor program at `6fDL4DShGriVMZy4pFQUhieLLnUEzmedmwXrcXVwk7Vm`.

## Run it
1. In the program repo: `anchor build`, then copy `target/idl/voting_on_chain.json` to `public/idl/voting_on_chain.json` here.
2. Deploy the program to devnet (`anchor deploy`) and set your wallet to devnet.
3. `npm install && npm run dev`

Set `VITE_RPC_URL` (see `.env.example`) to use another cluster or RPC.

## Notes
- Poll IDs 1-100 are scanned for the poll list; any ID can be opened directly.
- The program doesn't store a poll id on candidates, so candidate names are read from the poll's transaction history, plus names added from this browser. A candidate added from another client may not show until it appears in that history (the public devnet RPC keeps limited history).
- Creating a poll submits `init_poll` and up to 4 `initialize_candidate` calls in a single transaction.
