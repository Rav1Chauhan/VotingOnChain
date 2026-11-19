import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { utils } from "@coral-xyz/anchor";

export const PROGRAM_ID = new PublicKey("6fDL4DShGriVMZy4pFQUhieLLnUEzmedmwXrcXVwk7Vm");
export const MAX_NAME = 32;
export const MAX_DESC = 280;
export const MAX_POLL_SCAN = 100; // poll ids 1..100 are scanned for the poll list

const u64 = (n: number) => new BN(n).toArrayLike(Buffer, "le", 8);

export const pollPda = (id: number) =>
  PublicKey.findProgramAddressSync([Buffer.from("poll"), u64(id)], PROGRAM_ID)[0];
export const candidatePda = (id: number, name: string) =>
  PublicKey.findProgramAddressSync([u64(id), Buffer.from(name)], PROGRAM_ID)[0];
export const voterPda = (id: number, voter: PublicKey) =>
  PublicKey.findProgramAddressSync([Buffer.from("voter"), u64(id), voter.toBuffer()], PROGRAM_ID)[0];

export const byteLen = (s: string) => new TextEncoder().encode(s).length;

const readOnlyWallet = {
  publicKey: PublicKey.default,
  signTransaction: async <T,>(t: T) => t,
  signAllTransactions: async <T,>(t: T[]) => t,
};

let idlCache: any = null;
export async function loadIdl() {
  if (idlCache) return idlCache;
  const res = await fetch("/idl/voting_on_chain.json");
  const text = await res.text();
  try {
    idlCache = { ...JSON.parse(text), address: PROGRAM_ID.toBase58() };
  } catch {
    throw new Error("IDL not found. Copy target/idl/voting_on_chain.json from your Anchor build into public/idl/.");
  }
  return idlCache;
}

export function makeProgram(idl: any, connection: Connection, wallet?: any): Program<any> {
  const provider = new AnchorProvider(connection, wallet ?? (readOnlyWallet as any), { commitment: "confirmed" });
  return new Program(idl, provider);
}

export type Poll = { id: number; name: string; description: string; start: number; end: number; candidates: number };
export type Candidate = { name: string; votes: number };

const toPoll = (id: number, a: any): Poll => ({
  id,
  name: a.pollName,
  description: a.pollDescription,
  start: new BN(a.pollVotingStart).toNumber(),
  end: new BN(a.pollVotingEnd).toNumber(),
  candidates: new BN(a.pollOptionIndex).toNumber(),
});

export async function fetchPolls(program: Program<any>): Promise<Poll[]> {
  const ids = Array.from({ length: MAX_POLL_SCAN }, (_, i) => i + 1);
  const res = await (program.account as any).pollAccount.fetchMultiple(ids.map(pollPda));
  return res.flatMap((a: any, i: number) => (a ? [toPoll(ids[i], a)] : [])).reverse();
}

export async function fetchPoll(program: Program<any>, id: number): Promise<Poll | null> {
  const a = await (program.account as any).pollAccount.fetchNullable(pollPda(id));
  return a ? toPoll(id, a) : null;
}

const localKey = (id: number) => `voc:candidates:${id}`;
export const rememberCandidates = (id: number, names: string[]) => {
  const all = new Set([...JSON.parse(localStorage.getItem(localKey(id)) || "[]"), ...names]);
  localStorage.setItem(localKey(id), JSON.stringify([...all]));
};

// The program does not store a poll id on candidates, so names are recovered from
// the poll's transaction history (initialize_candidate calls) plus names this browser added.
async function discoverCandidateNames(program: Program<any>, id: number): Promise<string[]> {
  const names = new Set<string>(JSON.parse(localStorage.getItem(localKey(id)) || "[]"));
  const conn = program.provider.connection;
  try {
    const sigs = await conn.getSignaturesForAddress(pollPda(id), { limit: 100 });
    const txs = await conn.getParsedTransactions(
      sigs.filter((s) => !s.err).map((s) => s.signature),
      { maxSupportedTransactionVersion: 0, commitment: "confirmed" }
    );
    for (const tx of txs) {
      for (const ix of tx?.transaction.message.instructions ?? []) {
        if (!ix.programId.equals(PROGRAM_ID) || !("data" in ix)) continue;
        try {
          const dec: any = program.coder.instruction.decode(Buffer.from(utils.bytes.bs58.decode(ix.data)));
          if (dec && dec.name.replace(/_/g, "").toLowerCase() === "initializecandidate") {
            const d: any = dec.data;
            const c = d.candidate;
            if (new BN(d.pollId ?? d.poll_id).toNumber() === id) names.add(c);
          }
        } catch {}
      }
    }
  } catch (e) {
    console.warn("Candidate discovery from history failed", e);
  }
  return [...names];
}

export async function fetchCandidates(program: Program<any>, id: number): Promise<Candidate[]> {
  const names = await discoverCandidateNames(program, id);
  const accs = await (program.account as any).candidateAccount.fetchMultiple(names.map((n) => candidatePda(id, n)));
  return accs
    .flatMap((a: any, i: number) => (a ? [{ name: a.candidateName as string, votes: new BN(a.candidateVotes).toNumber() }] : []))
    .sort((a: Candidate, b: Candidate) => b.votes - a.votes);
}

export async function hasVoted(connection: Connection, id: number, voter: PublicKey) {
  return !!(await connection.getAccountInfo(voterPda(id, voter)));
}

export async function createPoll(
  program: Program<any>, id: number, start: number, end: number, name: string, description: string, candidates: string[]
) {
  const ixs = [
    await program.methods
      .initPoll(new BN(id), new BN(start), new BN(end), name, description)
      .accounts({ pollAccount: pollPda(id) } as any)
      .instruction(),
  ];
  for (const c of candidates) {
    ixs.push(await program.methods.initializeCandidate(new BN(id), c).accounts({ pollAccount: pollPda(id) } as any).instruction());
  }
  const tx = new Transaction().add(...ixs);
  const sig = await (program.provider as AnchorProvider).sendAndConfirm(tx);
  rememberCandidates(id, candidates);
  return sig;
}

export async function addCandidate(program: Program<any>, id: number, name: string) {
  const sig = await program.methods.initializeCandidate(new BN(id), name).accounts({ pollAccount: pollPda(id) } as any).rpc();
  rememberCandidates(id, [name]);
  return sig;
}

export const castVote = (program: Program<any>, id: number, name: string) =>
  program.methods.vote(new BN(id), name).accounts({ pollAccount: pollPda(id) } as any).rpc();

const ERRORS: Record<string, string> = {
  VotingNotStarted: "Voting hasn't started yet.",
  VotingEnded: "Voting has ended.",
  InvalidTimeRange: "The start time must be before the end time.",
  NameTooLong: "Names can be at most 32 bytes.",
  DescriptionTooLong: "The description can be at most 280 bytes.",
  Overflow: "Vote count overflow.",
};
export function friendlyError(e: any): string {
  const msg: string = e?.error?.errorCode?.code ? e.error.errorCode.code : e?.message ?? String(e);
  for (const k of Object.keys(ERRORS)) if (msg.includes(k)) return ERRORS[k];
  if (/already in use|custom program error: 0x0/.test(msg)) return "That account already exists (you may have already voted, or this poll/candidate exists).";
  if (/User rejected/i.test(msg)) return "Transaction cancelled in wallet.";
  return msg;
}
