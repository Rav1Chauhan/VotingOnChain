import { useCallback, useEffect, useMemo, useState } from "react";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
  Candidate, Poll, MAX_DESC, MAX_NAME, addCandidate, byteLen, castVote, createPoll, fetchCandidates,
  fetchPoll, fetchPolls, friendlyError, hasVoted, loadIdl, makeProgram,
} from "./lib/program";

type Toast = { kind: "ok" | "err"; text: string } | null;
const fmt = (t: number) => new Date(t * 1000).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const status = (p: Poll) => {
  const now = Date.now() / 1000;
  return now < p.start ? "upcoming" : now > p.end ? "ended" : "open";
};
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default function App() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [idl, setIdl] = useState<any>(null);
  const [idlError, setIdlError] = useState("");
  const [view, setView] = useState<"list" | "create" | number>("list");
  const [toast, setToast] = useState<Toast>(null);

  useEffect(() => { loadIdl().then(setIdl).catch((e) => setIdlError(e.message)); }, []);
  const program = useMemo(() => (idl ? makeProgram(idl, connection, wallet) : null), [idl, connection, wallet]);
  const notify = (kind: "ok" | "err", text: string) => { setToast({ kind, text }); setTimeout(() => setToast(null), 6000); };

  return (
    <div className="shell">
      <header className="top">
        <button className="brand" onClick={() => setView("list")}>VotingOnChain</button>
        <WalletMultiButton />
      </header>
      <main>
        {idlError && <p className="banner err">{idlError}</p>}
        {program && view === "list" && <PollList program={program} onOpen={setView} />}
        {program && view === "create" && <CreatePoll program={program} wallet={!!wallet} notify={notify} onDone={(id) => setView(id)} onBack={() => setView("list")} />}
        {program && typeof view === "number" && <PollPage key={view} program={program} id={view} wallet={wallet} notify={notify} onBack={() => setView("list")} />}
      </main>
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>}
    </div>
  );
}

function PollList({ program, onOpen }: { program: any; onOpen: (v: "create" | number) => void }) {
  const [polls, setPolls] = useState<Poll[] | null>(null);
  const [jump, setJump] = useState("");
  useEffect(() => { fetchPolls(program).then(setPolls).catch(() => setPolls([])); }, [program]);
  return (
    <section>
      <div className="row between">
        <h1>Polls</h1>
        <button className="btn" onClick={() => onOpen("create")}>Create a poll</button>
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (+jump > 0) onOpen(+jump); }}>
        <input type="number" min={1} placeholder="Open a poll by ID" value={jump} onChange={(e) => setJump(e.target.value)} />
        <button className="btn ghost">Open</button>
      </form>
      {polls === null && <p className="muted">Loading polls…</p>}
      {polls?.length === 0 && <p className="muted">No polls found with IDs 1–100. Create the first one.</p>}
      <ul className="polls">
        {polls?.map((p) => (
          <li key={p.id}>
            <button onClick={() => onOpen(p.id)} className="pollrow">
              <span className="id">#{p.id}</span>
              <span className="grow"><strong>{p.name}</strong><small>{p.candidates} candidate{p.candidates === 1 ? "" : "s"} · ends {fmt(p.end)}</small></span>
              <span className={`pill ${status(p)}`}>{status(p)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CreatePoll({ program, wallet, notify, onDone, onBack }: any) {
  const now = new Date();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [start, setStart] = useState(toLocalInput(now));
  const [end, setEnd] = useState(toLocalInput(new Date(now.getTime() + 24 * 3600 * 1000)));
  const [cands, setCands] = useState("");
  const [id, setId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetchPolls(program).then((ps) => setId(ps.length ? Math.max(...ps.map((p) => p.id)) + 1 : 1)); }, [program]);

  const names = cands.split("\n").map((s) => s.trim()).filter(Boolean);
  const s = Math.floor(new Date(start).getTime() / 1000), e = Math.floor(new Date(end).getTime() / 1000);
  const problem =
    !name ? "Give the poll a name." : byteLen(name) > MAX_NAME ? `Name is over ${MAX_NAME} bytes.` :
    byteLen(desc) > MAX_DESC ? `Description is over ${MAX_DESC} bytes.` :
    !(s < e) ? "Start must be before end." :
    names.some((n) => byteLen(n) > MAX_NAME) ? `A candidate name is over ${MAX_NAME} bytes.` :
    new Set(names).size !== names.length ? "Candidate names must be unique." :
    names.length > 4 ? "Add up to 4 candidates now; add more after creating." : "";

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!id) return;
    setBusy(true);
    try { await createPoll(program, id, s, e, name, desc, names); notify("ok", `Poll #${id} created.`); onDone(id); }
    catch (err) { notify("err", friendlyError(err)); }
    setBusy(false);
  }

  return (
    <section>
      <button className="link" onClick={onBack}>Back to polls</button>
      <h1>Create a poll{id ? ` (#${id})` : ""}</h1>
      <form onSubmit={submit} className="form">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Best programming language" /><em>{byteLen(name)}/{MAX_NAME}</em></label>
        <label>Description<textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} /><em>{byteLen(desc)}/{MAX_DESC}</em></label>
        <div className="row">
          <label className="grow">Voting opens<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
          <label className="grow">Voting closes<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        </div>
        <label>Candidates, one per line<textarea rows={4} value={cands} onChange={(e) => setCands(e.target.value)} placeholder={"Rust\nTypeScript"} /></label>
        {problem && name && <p className="hint">{problem}</p>}
        <button className="btn" disabled={busy || !wallet || !!problem || !id}>{!wallet ? "Connect a wallet to create" : busy ? "Waiting for wallet…" : "Create poll"}</button>
      </form>
    </section>
  );
}

function PollPage({ program, id, wallet, notify, onBack }: any) {
  const [poll, setPoll] = useState<Poll | null | undefined>(undefined);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState("");
  const [newName, setNewName] = useState("");
  const { connection } = useConnection();

  const load = useCallback(async () => {
    const p = await fetchPoll(program, id);
    setPoll(p);
    if (!p) return;
    setCands(await fetchCandidates(program, id));
    if (wallet) setVoted(await hasVoted(connection, id, wallet.publicKey));
  }, [program, id, wallet, connection]);
  useEffect(() => { load().catch((e) => { setPoll(null); notify("err", friendlyError(e)); }); }, [load]);

  if (poll === undefined) return <p className="muted">Loading poll…</p>;
  if (poll === null) return <section><button className="link" onClick={onBack}>Back to polls</button><h1>Poll #{id} not found</h1></section>;

  const st = status(poll);
  const total = cands.reduce((a, c) => a + c.votes, 0);
  const canVote = !!wallet && !voted && st === "open";

  async function vote(name: string) {
    setBusy(name);
    try { await castVote(program, id, name); notify("ok", `Vote cast for ${name}.`); await load(); }
    catch (e) { notify("err", friendlyError(e)); }
    setBusy("");
  }
  async function add(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy("add");
    try { await addCandidate(program, id, newName.trim()); setNewName(""); notify("ok", "Candidate added."); await load(); }
    catch (e) { notify("err", friendlyError(e)); }
    setBusy("");
  }

  return (
    <section>
      <button className="link" onClick={onBack}>Back to polls</button>
      <div className="row between"><h1>{poll.name}</h1><span className={`pill ${st}`}>{st}</span></div>
      {poll.description && <p className="desc">{poll.description}</p>}
      <p className="muted">Poll #{id} · opens {fmt(poll.start)} · closes {fmt(poll.end)}</p>
      {voted && <p className="banner ok">You've voted in this poll.</p>}
      {!wallet && st === "open" && <p className="banner">Connect a wallet to vote.</p>}
      {st === "upcoming" && <p className="banner">Voting opens {fmt(poll.start)}.</p>}

      {cands.length === 0 && <p className="muted">No candidates yet.</p>}
      <ul className="ballot">
        {cands.map((c) => {
          const pct = total ? Math.round((c.votes / total) * 100) : 0;
          return (
            <li key={c.name}>
              <button className="box" disabled={!canVote || !!busy} onClick={() => vote(c.name)} aria-label={`Vote for ${c.name}`}>
                {busy === c.name ? "…" : canVote ? "" : ""}
              </button>
              <div className="grow">
                <div className="row between"><strong>{c.name}</strong><span>{c.votes} vote{c.votes === 1 ? "" : "s"} · {pct}%</span></div>
                <div className="bar"><i style={{ width: `${pct}%` }} /></div>
              </div>
            </li>
          );
        })}
      </ul>

      {st !== "ended" && (
        <form className="row addrow" onSubmit={add}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Add a candidate" />
          <button className="btn ghost" disabled={!wallet || !newName.trim() || byteLen(newName) > MAX_NAME || !!busy}>Add candidate</button>
        </form>
      )}
    </section>
  );
}
