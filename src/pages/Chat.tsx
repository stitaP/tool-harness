/**
 * Agent Chat — talks to the local stitaP agent daemon (`harness serve`), which
 * runs real commands, edits files and keeps working until a task is done.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { AgentClient, getDaemonUrl, type AgentEvent, type SessionDetail, type SessionSummary } from "@/lib/agent-runtime/client";

type Item =
  | { kind: "user"; text: string; internal?: boolean }
  | { kind: "text"; text: string; live?: boolean }
  | { kind: "tool"; id: string; name: string; args: string; output: string; state: "run" | "ok" | "err" }
  | { kind: "note"; text: string }
  | { kind: "approval"; id: string; command: string; reason: string; done?: string }
  | { kind: "clarify"; id: string; question: string; choices?: string[]; done?: string };

function argSummary(a: any): string {
  if (!a || typeof a !== "object") return String(a ?? "");
  const v = a.command ?? a.path ?? a.query ?? a.url ?? a.name ?? a.goal ?? a.action ?? "";
  return typeof v === "string" ? v : JSON.stringify(v);
}

function fromDetail(d: SessionDetail): Item[] {
  const out: Item[] = [];
  const results = new Map(d.messages.filter((m) => m.role === "tool").map((m) => [m.tool_call_id, m]));
  for (const m of d.messages) {
    if (m.role === "user") out.push({ kind: "user", text: m.content ?? "", internal: !!m.meta?.compression_summary || !!(m.meta?.source && ["goal", "loop", "heartbeat", "notification", "cron", "kanban"].includes(m.meta.source)) });
    else if (m.role === "assistant") {
      if (m.content) out.push({ kind: "text", text: m.content });
      for (const c of m.tool_calls ?? []) {
        let args: any = {};
        try { args = JSON.parse(c.arguments); } catch { /* raw */ }
        const r = results.get(c.id);
        out.push({ kind: "tool", id: c.id, name: c.name, args: argSummary(args), output: r?.content ?? "", state: r && !/^(error|BLOCKED)/.test(r.content ?? "") ? "ok" : "err" });
      }
    }
  }
  for (const a of d.approvals) out.push({ kind: "approval", id: a.id, command: a.command, reason: a.reason });
  for (const q of d.clarify) out.push({ kind: "clarify", id: q.id, question: q.question, choices: q.choices });
  return out;
}

export default function Chat() {
  const [client] = useState(() => new AgentClient());
  const [url, setUrl] = useState(getDaemonUrl());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sid, setSid] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [todos, setTodos] = useState<SessionDetail["todos"]>([]);
  const [goal, setGoal] = useState<SessionDetail["goal"]>(null);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => setSessions(await client.sessions()), [client]);

  const connect = useCallback(async () => {
    setError("");
    try {
      client.baseUrl = url.replace(/\/+$/, "");
      await client.connect();
      setConnected(true);
      const list = await client.sessions();
      setSessions(list);
      setSid(list.find((s) => s.source === "web")?.id ?? (await client.createSession()).id);
    } catch (e: any) { setConnected(false); setError(e.message); }
  }, [client, url]);

  useEffect(() => { void connect(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!sid || !connected) return;
    let alive = true;
    void client.session(sid).then((d) => { if (!alive) return; setItems(fromDetail(d)); setBusy(d.busy); setTodos(d.todos); setGoal(d.goal); setModel(d.model); });
    const off = client.events(sid, (ev: AgentEvent) => {
      setItems((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        switch (ev.type) {
          case "user_message": next.push({ kind: "user", text: ev.text, internal: ev.internal }); break;
          case "token": if (last?.kind === "text" && last.live) next[next.length - 1] = { ...last, text: last.text + ev.text }; else next.push({ kind: "text", text: ev.text, live: true }); break;
          case "assistant_step": if (last?.kind === "text") next[next.length - 1] = { ...last, live: false }; break;
          case "tool_start": next.push({ kind: "tool", id: ev.id, name: ev.name, args: argSummary(ev.args), output: "", state: "run" }); break;
          case "tool_output": { const i = next.findIndex((x) => x.kind === "tool" && x.id === ev.id); if (i >= 0) next[i] = { ...(next[i] as any), output: (next[i] as any).output + ev.text }; break; }
          case "tool_end": { const i = next.findIndex((x) => x.kind === "tool" && x.id === ev.id); if (i >= 0) next[i] = { ...(next[i] as any), output: ev.result, state: ev.ok ? "ok" : "err" }; break; }
          case "turn_end": {
            if (last?.kind === "text" && last.live) next[next.length - 1] = { ...last, live: false, text: ev.final || last.text };
            else if (ev.final && !ev.silent) next.push({ kind: "text", text: ev.final });
            next.push({ kind: "note", text: `${ev.iterations} steps · ${ev.toolCalls} tool calls${ev.interrupted ? " · interrupted" : ""}` });
            break;
          }
          case "status": case "compressed": next.push({ kind: "note", text: ev.text }); break;
          case "approval_request": next.push({ kind: "approval", id: ev.id, command: ev.command, reason: ev.reason }); break;
          case "clarify_request": next.push({ kind: "clarify", id: ev.id, question: ev.question, choices: ev.choices }); break;
          case "notification": next.push({ kind: "note", text: `🔔 ${ev.text}` }); break;
        }
        return next;
      });
      if (ev.type === "busy") setBusy(ev.busy);
      if (ev.type === "todo") setTodos(ev.todos);
      if (ev.type === "goal") setGoal(ev.state);
      if (ev.type === "turn_end" || ev.type === "title") void refresh();
    });
    return () => { alive = false; off(); };
  }, [sid, connected, client, refresh]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [items]);

  const send = async () => {
    const text = input.trim();
    if (!text || !sid) return;
    setInput("");
    const r = await client.send(sid, text);
    if (r.command) {
      if (r.text) setItems((p) => [...p, { kind: "note", text: r.text }]);
      if (r.switchTo) { await refresh(); setSid(r.switchTo); }
    }
  };

  const resolveCard = (id: string, done: string) => setItems((p) => p.map((x) => ((x.kind === "approval" || x.kind === "clarify") && x.id === id ? { ...x, done } : x)));

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-lg w-full rounded-xl border bg-card p-6 space-y-4">
          <h1 className="text-xl font-semibold">Connect to your stitaP agent</h1>
          <p className="text-sm text-muted-foreground">The agent runs on your computer so it can execute commands and edit files. Start it with <code className="px-1 rounded bg-muted">harness serve</code> (or <code className="px-1 rounded bg-muted">npx @stitap/harness serve</code>, or <code className="px-1 rounded bg-muted">python -m stitap serve</code>).</p>
          <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={url} onChange={(e) => setUrl(e.target.value)} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm" onClick={() => void connect()}>Connect</button>
            <a className="rounded-md border px-4 py-2 text-sm" href={`${url}/`} target="_blank" rel="noreferrer">Open the built-in chat</a>
            <Link className="rounded-md border px-4 py-2 text-sm" to="/docs">Docs</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen grid grid-cols-[260px_1fr] lg:grid-cols-[260px_1fr_280px] bg-background text-foreground">
      <aside className="border-r flex flex-col min-w-0">
        <div className="p-3 font-semibold">stitaP agent</div>
        <button className="mx-3 mb-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted" onClick={async () => { const s = await client.createSession(); await refresh(); setSid(s.id); }}>＋ New chat</button>
        <div className="flex-1 overflow-y-auto px-2">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => setSid(s.id)} className={`w-full text-left rounded-md px-2 py-2 mb-1 text-sm ${s.id === sid ? "bg-muted" : "hover:bg-muted/60"}`}>
              <div className="truncate">{s.title || "Untitled"}</div>
              <div className="text-xs text-muted-foreground">{s.busy ? "● " : ""}{s.source} · {new Date(s.updated_at).toLocaleString()}</div>
            </button>
          ))}
        </div>
        <div className="p-3 text-xs text-muted-foreground border-t">{model} · {client.baseUrl}</div>
      </aside>
      <main className="flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-5 py-6 space-y-3">
            {items.map((it, i) => {
              if (it.kind === "user") return <div key={i} className="flex justify-end"><div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${it.internal ? "border border-dashed text-muted-foreground" : "bg-primary/10"}`}>{it.internal ? `↻ ${it.text.split("\n")[0].slice(0, 160)}` : it.text}</div></div>;
              if (it.kind === "text") return <div key={i} className="whitespace-pre-wrap text-sm leading-relaxed">{it.text}{it.live && <span className="animate-pulse">▍</span>}</div>;
              if (it.kind === "note") return <div key={i} className="text-xs text-muted-foreground">· {it.text}</div>;
              if (it.kind === "tool") return (
                <details key={i} className="rounded-lg border text-xs">
                  <summary className="cursor-pointer px-3 py-1.5 flex gap-2"><span>{it.state === "run" ? "◌" : it.state === "ok" ? "✓" : "✕"}</span><span className="font-mono font-semibold">{it.name}</span><span className="font-mono text-muted-foreground truncate">{it.args}</span></summary>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t bg-muted/40 p-2 font-mono">{it.output}</pre>
                </details>
              );
              if (it.kind === "approval") return (
                <div key={i} className="rounded-lg border border-amber-500 p-3 text-sm">
                  <div className="font-semibold">⚠ Approval needed — {it.reason}</div>
                  <pre className="my-2 whitespace-pre-wrap rounded bg-muted p-2 font-mono text-xs">{it.command}</pre>
                  {it.done ? <div className="text-xs text-muted-foreground">{it.done}</div> : (
                    <div className="flex flex-wrap gap-2">
                      {(["once", "session", "always", "deny"] as const).map((d) => <button key={d} className="rounded-md border px-3 py-1 text-xs hover:bg-muted" onClick={async () => { await client.approve(it.id, d); resolveCard(it.id, d === "deny" ? "Denied" : `Approved (${d})`); }}>{d === "deny" ? "Deny" : `Allow ${d}`}</button>)}
                    </div>
                  )}
                </div>
              );
              return (
                <div key={i} className="rounded-lg border border-primary p-3 text-sm">
                  <div className="font-semibold">❓ {it.question}</div>
                  {it.done ? <div className="text-xs text-muted-foreground mt-1">Answered: {it.done}</div> : (
                    <div className="flex flex-wrap gap-2 mt-2">{(it.choices ?? []).map((c) => <button key={c} className="rounded-md border px-3 py-1 text-xs hover:bg-muted" onClick={async () => { await client.answer(it.id, c); resolveCard(it.id, c); }}>{c}</button>)}</div>
                  )}
                </div>
              );
            })}
            <div ref={bottom} />
          </div>
        </div>
        <div className="border-t p-3">
          <div className="max-w-3xl mx-auto flex gap-2">
            <textarea className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm min-h-[44px] max-h-48" rows={1} placeholder="Give the agent a task…  (/goal to keep it working until done, /help for commands)" value={input}
              onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} />
            {busy
              ? <button className="rounded-xl bg-red-600 text-white px-4 text-sm" onClick={() => sid && void client.interrupt(sid)}>Stop</button>
              : <button className="rounded-xl bg-primary text-primary-foreground px-4 text-sm" onClick={() => void send()}>Send</button>}
          </div>
        </div>
      </main>
      <aside className="hidden lg:block border-l p-4 text-sm overflow-y-auto">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Plan</div>
        {todos.length ? todos.map((t) => <div key={t.id} className={`flex gap-2 py-0.5 ${t.status === "completed" ? "line-through text-muted-foreground" : t.status === "in_progress" ? "font-medium" : ""}`}><span>{t.status === "completed" ? "✔" : t.status === "in_progress" ? "▸" : "○"}</span>{t.content}</div>) : <div className="text-muted-foreground">No plan yet.</div>}
        <div className="text-xs uppercase tracking-wide text-muted-foreground mt-5 mb-2">Goal</div>
        {goal ? <div><b>[{goal.status}]</b> {goal.turns}/{goal.max_turns}<div>{goal.text}</div>{goal.last_reason && <div className="text-muted-foreground italic mt-1">{goal.last_reason}</div>}</div> : <div className="text-muted-foreground">Use /goal to keep the agent working until done.</div>}
      </aside>
    </div>
  );
}
