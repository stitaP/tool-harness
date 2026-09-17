import { useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Users, FileText, Globe, Wrench, CheckCircle2, Plus, Trash2, GitBranch,
  ShieldCheck, CircleDot,
} from "lucide-react";
import { SiteNav } from "@/components/site/SiteNav";
import { SiteFooter } from "@/components/site/SiteFooter";
import { ALL_TOOLS } from "@/lib/store/registry";
import {
  AGENT_STATES, ROLE_CATALOG, SOLUTION_TEMPLATES,
  createWorkspace, assignAgent, addFeedback, checkinDestinations, validateConfig,
  renderScopePrompt,
} from "@/lib/agent/studio";
import type { AgentConfig, AgentState, KnowledgeSource, SyncPreferences, TeamWorkspace } from "@/lib/agent/studio";

const card = "rounded-xl border border-zinc-800 bg-zinc-900/60 p-5";
const input =
  "w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-[13px] text-zinc-200 outline-none focus:border-cyan-600";
const btn =
  "inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3.5 py-2 text-[13px] font-medium text-white transition hover:bg-cyan-500";
const btnGhost =
  "inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] text-zinc-300 transition hover:border-zinc-500 hover:text-white";

function StateDot({ state }: { state: AgentState }) {
  const s = AGENT_STATES[state];
  return (
    <span className="inline-flex items-center gap-1.5" title={s.meaning}>
      <CircleDot className={`size-3.5 ${s.color}`} />
      <span className="text-[11px] text-zinc-400">{s.label}</span>
    </span>
  );
}

export default function AgentStudio() {
  const [ws, setWs] = useState<TeamWorkspace>(createWorkspace);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // New-agent draft
  const [name, setName] = useState("");
  const [role, setRole] = useState("coder");
  const [scope, setScope] = useState("");
  const [policy, setPolicy] = useState<"confined" | "web-allowed">("confined");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [sourceDraft, setSourceDraft] = useState("");
  const [sourceKind, setSourceKind] = useState<KnowledgeSource["kind"]>("pdf");
  const [toolIds, setToolIds] = useState<Set<string>>(new Set());
  const [principles, setPrinciples] = useState<Record<string, string>>({});
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [toolFilter, setToolFilter] = useState("");

  // Workspace drafts
  const [taskTitle, setTaskTitle] = useState("");
  const [feedbackDraft, setFeedbackDraft] = useState("");
  const [feedbackTask, setFeedbackTask] = useState("");

  const selected = ws.agents.find((a) => a.id === selectedId) ?? null;

  const filteredTools = useMemo(
    () =>
      ALL_TOOLS.filter(
        (t) =>
          toolFilter === "" ||
          t.id.includes(toolFilter.toLowerCase()) ||
          t.name.toLowerCase().includes(toolFilter.toLowerCase()) ||
          t.category?.includes(toolFilter.toLowerCase()),
      ).slice(0, 60),
    [toolFilter],
  );

  function createAgent() {
    const agent: AgentConfig = {
      id: `agent-${ws.agents.length + 1}`,
      name: name.trim() || `${role}-${ws.agents.length + 1}`,
      role,
      scope: scope.trim(),
      knowledge: {
        policy,
        sources,
      },
      tools: [...toolIds].map((toolId) => ({
        toolId,
        enabled: true,
        principle: principles[toolId] ?? "",
      })),
      templateId,
      contextTokens: ROLE_CATALOG.find((r) => r.role === role)?.defaultContextTokens ?? 4096,
      state: "idle",
    };
    const errors = validateConfig(agent);
    if (errors.length > 0) {
      alert(errors.join("\n"));
      return;
    }
    setWs((w) => ({ ...w, agents: [...w.agents, agent] }));
    setSelectedId(agent.id);
    setName("");
    setScope("");
    setSources([]);
    setToolIds(new Set());
    setPrinciples({});
    setTemplateId(undefined);
  }

  function addSource() {
    const ref = sourceDraft.trim();
    if (!ref) return;
    setSources((s) => [
      ...s,
      { id: `src-${s.length + 1}`, kind: sourceKind, ref, enabled: true, refetchAllowed: sourceKind === "url" },
    ]);
    setSourceDraft("");
  }

  function addTask() {
    const title = taskTitle.trim();
    if (!title) return;
    setWs((w) => ({
      ...w,
      tasks: [
        ...w.tasks,
        {
          id: `task-${w.tasks.length + 1}`,
          title,
          status: "todo" as const,
          createdBy: "u-owner",
          ticketKey: w.sync.ticketing !== "none" ? `${w.sync.ticketing.toUpperCase()}-${w.tasks.length + 1}` : undefined,
        },
      ],
    }));
    setTaskTitle("");
  }

  function sendFeedback(verdict: "approve" | "request-changes" | "comment") {
    const taskId = feedbackTask || ws.tasks[0]?.id;
    if (!taskId || !feedbackDraft.trim()) return;
    setWs((w) =>
      addFeedback(w, { taskId, userId: "u-owner", comment: feedbackDraft.trim(), verdict }),
    );
    setFeedbackDraft("");
  }

  function setSync(patch: Partial<SyncPreferences>) {
    setWs((w) => ({ ...w, sync: { ...w.sync, ...patch } }));
  }

  const destinations = checkinDestinations(ws.sync);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200">
      <SiteNav />
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        {/* Header + state legend */}
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-white">Agent Studio</h1>
              <p className="mt-1 text-[13px] text-gray-400">
                Define roles, scope knowledge and tools, attach solution templates, and run the team workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {Object.values(AGENT_STATES).map((s) => (
                <StateDot key={s.state} state={s.state} />
              ))}
            </div>
          </div>
        </div>

        {/* Role catalog */}
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Users className="size-5 text-cyan-400" /> Where roles are defined
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] text-gray-400">
            Every agent takes one of the eight swarm roles. Each role carries fixed responsibilities and a
            default scope; your configuration narrows or extends it.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {ROLE_CATALOG.map((r) => (
              <div key={r.role} className={card}>
                <h3 className="text-[14px] font-semibold text-white">{r.title}</h3>
                <span className="font-mono text-[10px] text-zinc-500">{r.role} · {r.defaultContextTokens} tok</span>
                <ul className="mt-2 space-y-1">
                  {r.responsibilities.map((x) => (
                    <li key={x} className="flex items-start gap-1.5 text-[12px] text-zinc-400">
                      <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" />{x}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* ── Define an agent ── */}
          <section className={card}>
            <h2 className="text-lg font-semibold text-white">Define an agent</h2>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" className={input} />
              <select value={role} onChange={(e) => setRole(e.target.value)} className={input}>
                {ROLE_CATALOG.map((r) => (
                  <option key={r.role} value={r.role}>{r.title}</option>
                ))}
              </select>
            </div>
            <textarea
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="Scope: e.g. 'Own the checkout-flow migration. Do not touch payments code.'"
              className={`${input} mt-2 h-16 resize-none`}
            />

            {/* Knowledge scope */}
            <h3 className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-white">
              <FileText className="size-4 text-cyan-400" /> Knowledge scope
            </h3>
            <label className="mt-2 flex items-center gap-2 text-[12px] text-zinc-300">
              <input
                type="checkbox"
                checked={policy === "web-allowed"}
                onChange={(e) => setPolicy(e.target.checked ? "web-allowed" : "confined")}
              />
              Allow browsing the internet when provided material is insufficient
            </label>
            <p className="mt-1 text-[11px] text-zinc-500">
              {policy === "confined"
                ? "Confined: the agent may only use the material below. Enabled web sources are rejected at save time."
                : "Web-allowed: browsing is permitted with citations."}
            </p>
            <div className="mt-2 flex gap-2">
              <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as KnowledgeSource["kind"])} className={`${input} w-28`}>
                <option value="pdf">PDF</option>
                <option value="url">Web link</option>
                <option value="note">Note</option>
                <option value="web">Online material</option>
              </select>
              <input
                value={sourceDraft}
                onChange={(e) => setSourceDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSource()}
                placeholder={sourceKind === "url" ? "https://docs.example.com/guide" : "file or note name"}
                className={input}
              />
              <button onClick={addSource} className={btnGhost}><Plus className="size-3.5" /> Add</button>
            </div>
            <div className="mt-2 space-y-1">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-1.5 text-[12px]">
                  <label className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) =>
                        setSources((arr) => arr.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)))
                      }
                    />
                    <span className="truncate text-zinc-300">{s.ref}</span>
                    <span className="font-mono text-[10px] text-zinc-600">{s.kind}</span>
                  </label>
                  <button onClick={() => setSources((arr) => arr.filter((x) => x.id !== s.id))} className="text-zinc-500 hover:text-rose-400">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Tool scope */}
            <h3 className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-white">
              <Wrench className="size-4 text-cyan-400" /> Tool scope ({toolIds.size} selected of {ALL_TOOLS.length})
            </h3>
            <input
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              placeholder="Filter tools: browser., capture, testing…"
              className={`${input} mt-2`}
            />
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto pr-1">
              {filteredTools.map((t) => {
                const on = toolIds.has(t.id);
                return (
                  <div key={t.id} className="rounded-lg border border-zinc-800 px-3 py-1.5">
                    <label className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex min-w-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => {
                            setToolIds((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(t.id);
                              else next.delete(t.id);
                              return next;
                            });
                          }}
                        />
                        <span className="truncate font-mono text-zinc-300">{t.id}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-600">{t.category}</span>
                    </label>
                    {on && (
                      <input
                        value={principles[t.id] ?? ""}
                        onChange={(e) => setPrinciples((p) => ({ ...p, [t.id]: e.target.value }))}
                        placeholder="Basic principle for this agent's use (e.g. 'read-only unless the story says write')"
                        className={`${input} mt-1.5 py-1 text-[11px]`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Solution template */}
            <h3 className="mt-4 text-[13px] font-semibold text-white">Solution template</h3>
            <select
              value={templateId ?? ""}
              onChange={(e) => setTemplateId(e.target.value || undefined)}
              className={`${input} mt-2`}
            >
              <option value="">None — freeform behavior</option>
              {SOLUTION_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {templateId && (
              <div className="mt-2 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-[11px] text-zinc-400">
                <p className="text-zinc-300">{SOLUTION_TEMPLATES.find((t) => t.id === templateId)?.description}</p>
                {SOLUTION_TEMPLATES.find((t) => t.id === templateId)?.steps.map((s, i) => (
                  <p key={i} className="mt-1">· When <span className="text-cyan-400">{s.trigger}</span> → {s.action}{s.toolHint ? ` (${s.toolHint})` : ""}</p>
                ))}
              </div>
            )}

            <button onClick={createAgent} className={`${btn} mt-4`}>
              <Plus className="size-4" /> Create agent
            </button>
          </section>

          {/* ── Roster + workspace ── */}
          <section className="space-y-6">
            <div className={card}>
              <h2 className="text-lg font-semibold text-white">Agent roster</h2>
              {ws.agents.length === 0 && <p className="mt-2 text-[13px] text-zinc-500">No agents yet — define one on the left.</p>}
              <div className="mt-3 space-y-2">
                {ws.agents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      selectedId === a.id ? "border-cyan-600 bg-cyan-950/30" : "border-zinc-800 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-white">{a.name}</span>
                      <StateDot state={a.state} />
                    </div>
                    <span className="text-[11px] text-zinc-500">
                      {ROLE_CATALOG.find((r) => r.role === a.role)?.title} · {a.tools.filter((t) => t.enabled).length} tools ·{" "}
                      {a.knowledge.sources.filter((s) => s.enabled).length} docs ·{" "}
                      {a.knowledge.policy === "confined" ? "confined" : "web-allowed"}
                      {a.templateId ? ` · ${SOLUTION_TEMPLATES.find((t) => t.id === a.templateId)?.name}` : ""}
                    </span>
                  </button>
                ))}
              </div>
              {selected && (
                <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                  <h4 className="text-[12px] font-semibold text-zinc-300">System-prompt scope for {selected.name}</h4>
                  <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[10px] leading-4 text-zinc-500">
                    {renderScopePrompt(selected).join("\n")}
                  </pre>
                </div>
              )}
            </div>

            {/* Team workspace */}
            <div className={card}>
              <h2 className="text-lg font-semibold text-white">Team workspace</h2>
              <p className="mt-1 text-[12px] text-zinc-500">
                Multiple users assign defined agents to tasks and leave feedback. Checkins land on the
                internal git; external platforms receive them only per your preferences.
              </p>

              <div className="mt-3 flex gap-2">
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addTask()}
                  placeholder="New task title"
                  className={input}
                />
                <button onClick={addTask} className={btnGhost}><Plus className="size-3.5" /> Task</button>
              </div>

              <div className="mt-3 space-y-2">
                {ws.tasks.map((t) => {
                  const agent = ws.agents.find((a) => a.id === t.assignedAgentId);
                  return (
                    <div key={t.id} className="rounded-lg border border-zinc-800 px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13px] text-zinc-200">
                          {t.ticketKey && <span className="mr-2 font-mono text-[10px] text-cyan-400">{t.ticketKey}</span>}
                          {t.title}
                        </span>
                        <div className="flex items-center gap-2">
                          {agent ? (
                            <StateDot state={agent.state} />
                          ) : (
                            <select
                              onChange={(e) => e.target.value && setWs((w) => assignAgent(w, t.id, e.target.value))}
                              value=""
                              className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-[11px] text-zinc-300"
                            >
                              <option value="">Assign agent…</option>
                              {ws.agents.map((a) => (
                                <option key={a.id} value={a.id}>{a.name}</option>
                              ))}
                            </select>
                          )}
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-[10px] text-zinc-400">{t.status}</span>
                        </div>
                      </div>
                      {ws.feedback.filter((f) => f.taskId === t.id).map((f) => (
                        <p key={f.id} className="mt-1 border-l-2 border-zinc-700 pl-2 text-[11px] text-zinc-500">
                          <span className={f.verdict === "approve" ? "text-emerald-400" : f.verdict === "request-changes" ? "text-amber-400" : ""}>
                            {f.verdict}
                          </span>{" "}
                          — {f.comment}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>

              {ws.tasks.length > 0 && (
                <div className="mt-3 space-y-2">
                  <select value={feedbackTask} onChange={(e) => setFeedbackTask(e.target.value)} className={input}>
                    <option value="">Feedback on task…</option>
                    {ws.tasks.map((t) => (
                      <option key={t.id} value={t.id}>{t.ticketKey ? `${t.ticketKey} · ` : ""}{t.title}</option>
                    ))}
                  </select>
                  <textarea
                    value={feedbackDraft}
                    onChange={(e) => setFeedbackDraft(e.target.value)}
                    placeholder="Feedback for the assigned agent…"
                    className={`${input} h-14 resize-none`}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => sendFeedback("approve")} className="rounded-lg bg-emerald-600/80 px-3 py-1.5 text-[12px] text-white hover:bg-emerald-500">Approve</button>
                    <button onClick={() => sendFeedback("request-changes")} className="rounded-lg bg-amber-600/80 px-3 py-1.5 text-[12px] text-white hover:bg-amber-500">Request changes</button>
                    <button onClick={() => sendFeedback("comment")} className={btnGhost}>Comment</button>
                  </div>
                </div>
              )}
            </div>

            {/* Sync preferences */}
            <div className={card}>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
                <GitBranch className="size-5 text-cyan-400" /> Synchronization preferences
              </h2>
              <p className="mt-1 text-[12px] text-zinc-500">
                Agent checkins always land on the internal git. External platforms are opt-in, never a side effect.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                <label className="space-y-1">
                  <span className="text-zinc-400">External git platform</span>
                  <select
                    value={ws.sync.externalGit}
                    onChange={(e) => setSync({ externalGit: e.target.value as SyncPreferences["externalGit"] })}
                    className={input}
                  >
                    <option value="none">None (internal only)</option>
                    <option value="github">GitHub</option>
                    <option value="gitlab">GitLab</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">Ticketing platform</span>
                  <select
                    value={ws.sync.ticketing}
                    onChange={(e) => setSync({ ticketing: e.target.value as SyncPreferences["ticketing"] })}
                    className={input}
                  >
                    <option value="none">None</option>
                    <option value="jira">Jira</option>
                    <option value="linear">Linear</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={ws.sync.externalGitEnabled}
                    onChange={(e) => setSync({ externalGitEnabled: e.target.checked })}
                  />
                  Push to external git
                </label>
                <label className="flex items-center gap-2 text-zinc-300">
                  <input
                    type="checkbox"
                    checked={ws.sync.autoAttachEvidence}
                    onChange={(e) => setSync({ autoAttachEvidence: e.target.checked })}
                  />
                  Attach evidence to tickets
                </label>
                <label className="space-y-1">
                  <span className="text-zinc-400">External sync cadence</span>
                  <select
                    value={ws.sync.syncOn}
                    onChange={(e) => setSync({ syncOn: e.target.value as SyncPreferences["syncOn"] })}
                    className={input}
                  >
                    <option value="manual">Manual only</option>
                    <option value="milestone">On milestones</option>
                    <option value="daily">Daily</option>
                  </select>
                </label>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-zinc-950/60 p-3">
                <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
                <p className="text-[11px] text-zinc-400">
                  Checkins go to: <span className="text-zinc-200">{destinations.join(" · ")}</span>
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Docs pointer */}
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[13px] text-zinc-400">
              <Globe className="mr-1 inline size-4 text-cyan-400" />
              Full procedures and concepts for the studio are in the manual: chapter "Agent Studio" —
              role catalog, knowledge scoping, tool principles, templates, workspace, and sync rules.
            </p>
            <Link to="/docs/pdf" className={btnGhost}>Download the manual (PDF)</Link>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
