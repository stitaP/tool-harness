/**
 * Jira REST API Client
 *
 * Self-contained HTTP client for Jira (Cloud and Server).
 * Supports: issues, user stories, comments, transitions,
 * search (JQL), boards, sprints, priorities, labels, attachments.
 *
 * Zero external dependencies — uses raw fetch().
 */

import { GitHTTPClient } from "./git-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JiraConfig {
  /** Jira instance URL (e.g., "https://yourteam.atlassian.net") */
  baseUrl: string;
  /** Email for Jira Cloud or username for Jira Server */
  email?: string;
  /** API token (Cloud) or password (Server) */
  token: string;
  /** Project key (e.g., "PROJ") */
  projectKey: string;
}

export type JiraIssueType = "story" | "task" | "bug" | "epic" | "subtask" | "feature" | "improvement" | string;
export type JiraPriority = "highest" | "high" | "medium" | "low" | "lowest";
export type JiraIssueStatus = "to do" | "in progress" | "in review" | "done" | "cancelled" | string;

export interface JiraIssue {
  id: string;
  key: string;
  self: string;
  summary: string;
  description: string;
  type: JiraIssueType;
  status: JiraIssueStatus;
  priority: JiraPriority;
  assignee?: string;
  reporter: string;
  labels: string[];
  components: string[];
  fixVersions: string[];
  sprint?: string;
  epicLink?: string;
  storyPoints?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  dueDate?: string;
  parentKey?: string;
  subtasks: string[];
  originalEstimate?: string;
  timeSpent?: string;
  /** Link to the issue in the web UI */
  webUrl: string;
}

export interface JiraComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface JiraTransition {
  id: string;
  name: string;
  toStatus: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: "active" | "closed" | "future";
  startDate?: string;
  endDate?: string;
  goal?: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: "scrum" | "kanban";
  projectKey: string;
}

export interface JiraSearchResult {
  issues: JiraIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

export interface JiraWorklog {
  id: string;
  author: string;
  comment: string;
  timeSpent: string;
  started: string;
}

// ─── Jira Client ─────────────────────────────────────────────────────────────

export class JiraClient {
  private client: GitHTTPClient;
  private config: JiraConfig;

  constructor(config: JiraConfig) {
    this.config = config;
    const baseUrl = config.baseUrl.replace(/\/$/, "") + "/rest/api/3";

    // Jira Cloud uses Basic auth with email:token
    // Jira Server uses Basic auth with username:password
    let authHeader: string | undefined;
    if (config.email) {
      authHeader = "Basic " + btoa(`${config.email}:${config.token}`);
    } else {
      authHeader = "Bearer " + config.token;
    }

    this.client = new GitHTTPClient(baseUrl, undefined);
    // Override default headers for Jira auth
    (this.client as unknown as { defaultHeaders: Record<string, string> }).defaultHeaders = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      ...(authHeader ? { Authorization: authHeader } : {}),
    };
  }

  private get projectKey() { return this.config.projectKey; }

  // ─── Issues ──────────────────────────────────────────────────────────────

  /** Search issues using JQL */
  async search(jql: string, options?: { maxResults?: number; startAt?: number; fields?: string[] }): Promise<JiraSearchResult> {
    const body: Record<string, unknown> = {
      jql,
      maxResults: options?.maxResults || 50,
      startAt: options?.startAt || 0,
      fields: options?.fields || ["summary", "status", "priority", "assignee", "reporter", "labels", "components", "fixVersions", "issuetype", "created", "updated", "resolutiondate", "duedate", "parent", "subtasks", "timetracking", "customfield_10016"],
    };

    const data = await this.client.post<{ issues: Array<{ id: string; key: string; self: string; fields: Record<string, unknown> }>; total: number; startAt: number; maxResults: number }>("/search", body);

    return {
      issues: data.issues.map(i => this.parseIssue(i)),
      total: data.total,
      startAt: data.startAt,
      maxResults: data.maxResults,
    };
  }

  /** Get all issues in the project */
  async listIssues(status?: JiraIssueStatus, maxResults = 50): Promise<JiraIssue[]> {
    let jql = `project = "${this.projectKey}"`;
    if (status) jql += ` AND status = "${status}"`;
    jql += " ORDER BY updated DESC";
    const result = await this.search(jql, { maxResults });
    return result.issues;
  }

  /** Get a single issue by key */
  async getIssue(key: string): Promise<JiraIssue> {
    const data = await this.client.get<{ id: string; key: string; self: string; fields: Record<string, unknown> }>(`/issue/${key}?expand=transitions`);
    return this.parseIssue(data);
  }

  /** Create a new issue */
  async createIssue(fields: {
    summary: string;
    description?: string;
    type: JiraIssueType;
    priority?: JiraPriority;
    assignee?: string;
    labels?: string[];
    components?: string[];
    fixVersions?: string[];
    parentKey?: string;
    storyPoints?: number;
    dueDate?: string;
  }): Promise<JiraIssue> {
    const issueFields: Record<string, unknown> = {
      project: { key: this.projectKey },
      summary: fields.summary,
      issuetype: { name: fields.type },
    };

    if (fields.description) {
      issueFields.description = this.toADF(fields.description);
    }
    if (fields.priority) {
      issueFields.priority = { name: fields.priority };
    }
    if (fields.assignee) {
      issueFields.assignee = { accountId: fields.assignee };
    }
    if (fields.labels) {
      issueFields.labels = fields.labels;
    }
    if (fields.components) {
      issueFields.components = fields.components.map(c => ({ name: c }));
    }
    if (fields.fixVersions) {
      issueFields.fixVersions = fields.fixVersions.map(v => ({ name: v }));
    }
    if (fields.parentKey) {
      issueFields.parent = { key: fields.parentKey };
    }
    if (fields.storyPoints) {
      issueFields.customfield_10016 = fields.storyPoints;
    }
    if (fields.dueDate) {
      issueFields.duedate = fields.dueDate;
    }

    const data = await this.client.post<{ id: string; key: string; self: string; fields: Record<string, unknown> }>("/issue", { fields: issueFields });
    return this.parseIssue(data);
  }

  /** Update an issue */
  async updateIssue(key: string, fields: Partial<{
    summary: string;
    description: string;
    priority: JiraPriority;
    assignee: string;
    labels: string[];
    components: string[];
    fixVersions: string[];
    dueDate: string;
    storyPoints: number;
  }>): Promise<void> {
    const updateFields: Record<string, unknown> = {};
    if (fields.summary) updateFields.summary = fields.summary;
    if (fields.description) updateFields.description = this.toADF(fields.description);
    if (fields.priority) updateFields.priority = { name: fields.priority };
    if (fields.assignee) updateFields.assignee = { accountId: fields.assignee };
    if (fields.labels) updateFields.labels = fields.labels;
    if (fields.components) updateFields.components = fields.components.map(c => ({ name: c }));
    if (fields.fixVersions) updateFields.fixVersions = fields.fixVersions.map(v => ({ name: v }));
    if (fields.dueDate) updateFields.duedate = fields.dueDate;
    if (fields.storyPoints) updateFields.customfield_10016 = fields.storyPoints;

    await this.client.put(`/issue/${key}`, { fields: updateFields });
  }

  /** Transition an issue to a new status */
  async transitionIssue(key: string, transitionName: string): Promise<void> {
    const transitions = await this.getTransitions(key);
    const transition = transitions.find(t => t.name.toLowerCase() === transitionName.toLowerCase());
    if (!transition) {
      throw new Error(`Transition "${transitionName}" not found. Available: ${transitions.map(t => t.name).join(", ")}`);
    }
    await this.client.post(`/issue/${key}/transitions`, { transition: { id: transition.id } });
  }

  /** Get available transitions for an issue */
  async getTransitions(key: string): Promise<JiraTransition[]> {
    const data = await this.client.get<{ transitions: Array<{ id: string; name: string; to: { name: string } }> }>(`/issue/${key}/transitions`);
    return data.transitions.map(t => ({ id: t.id, name: t.name, toStatus: t.to.name }));
  }

  /** Add a comment to an issue */
  async addComment(key: string, body: string): Promise<JiraComment> {
    const data = await this.client.post<{ id: string; author: { displayName: string }; body: unknown; created: string; updated: string }>(`/issue/${key}/comment`, {
      body: this.toADF(body),
    });
    return {
      id: data.id,
      author: data.author?.displayName || "Unknown",
      body: this.fromADF(data.body),
      createdAt: data.created,
      updatedAt: data.updated,
    };
  }

  /** List comments on an issue */
  async listComments(key: string): Promise<JiraComment[]> {
    const data = await this.client.get<{ comments: Array<{ id: string; author: { displayName: string }; body: unknown; created: string; updated: string }> }>(`/issue/${key}/comment`);
    return data.comments.map(c => ({
      id: c.id,
      author: c.author?.displayName || "Unknown",
      body: this.fromADF(c.body),
      createdAt: c.created,
      updatedAt: c.updated,
    }));
  }

  /** Delete a comment */
  async deleteComment(key: string, commentId: string): Promise<void> {
    await this.client.delete(`/issue/${key}/comment/${commentId}`);
  }

  // ─── Worklog ─────────────────────────────────────────────────────────────

  /** Log work on an issue */
  async addWorklog(key: string, timeSpent: string, comment?: string, started?: string): Promise<JiraWorklog> {
    const body: Record<string, unknown> = { timeSpent };
    if (comment) body.comment = this.toADF(comment);
    if (started) body.started = started;

    const data = await this.client.post<{ id: string; author: { displayName: string }; comment: unknown; timeSpent: string; started: string }>(`/issue/${key}/worklog`, body);
    return {
      id: data.id,
      author: data.author?.displayName || "Unknown",
      comment: data.comment ? this.fromADF(data.comment) : "",
      timeSpent: data.timeSpent,
      started: data.started,
    };
  }

  // ─── Boards & Sprints ────────────────────────────────────────────────────

  /** List boards for the project */
  async listBoards(): Promise<JiraBoard[]> {
    const data = await this.client.get<{ values: Array<{ id: number; name: string; type: string; location: { projectKey: string } }> }>(`/board?projectKeyOrId=${this.projectKey}`);
    return data.values.map(b => ({ id: b.id, name: b.name, type: b.type as "scrum" | "kanban", projectKey: b.location?.projectKey || this.projectKey }));
  }

  /** List sprints for a board */
  async listSprints(boardId: number): Promise<JiraSprint[]> {
    const data = await this.client.get<{ values: Array<{ id: number; name: string; state: string; startDate?: string; endDate?: string; goal?: string }> }>(`/board/${boardId}/sprint`);
    return data.values.map(s => ({ id: s.id, name: s.name, state: s.state as "active" | "closed" | "future", startDate: s.startDate, endDate: s.endDate, goal: s.goal }));
  }

  /** Get issues in a sprint */
  async getSprintIssues(sprintId: number): Promise<JiraIssue[]> {
    const data = await this.client.get<{ issues: Array<{ id: string; key: string; self: string; fields: Record<string, unknown> }> }>(`/sprint/${sprintId}/issue`);
    return data.issues.map(i => this.parseIssue(i));
  }

  // ─── Labels & Components ──────────────────────────────────────────────────

  /** List all labels used in the project */
  async listLabels(): Promise<string[]> {
    const result = await this.search(`project = "${this.projectKey}"`, { maxResults: 200, fields: ["labels"] });
    const labels = new Set<string>();
    for (const issue of result.issues) {
      for (const label of issue.labels) labels.add(label);
    }
    return Array.from(labels).sort();
  }

  /** List all components in the project */
  async listComponents(): Promise<string[]> {
    const data = await this.client.get<Array<{ name: string }>>(`/project/${this.projectKey}/components`);
    return data.map(c => c.name);
  }

  // ─── Bulk Operations ─────────────────────────────────────────────────────

  /** Create multiple issues at once */
  async createIssues(issues: Array<{
    summary: string;
    type: JiraIssueType;
    description?: string;
    priority?: JiraPriority;
    labels?: string[];
    parentKey?: string;
  }>): Promise<JiraIssue[]> {
    const results: JiraIssue[] = [];
    for (const issue of issues) {
      const created = await this.createIssue(issue);
      results.push(created);
    }
    return results;
  }

  /** Get all issues from a user story (epic) */
  async getEpicIssues(epicKey: string): Promise<JiraIssue[]> {
    const result = await this.search(`parent = ${epicKey} ORDER BY rank ASC`);
    return result.issues;
  }

  /** Get blocking/blocked relationships */
  async getLinkedIssues(key: string): Promise<Array<{ type: string; inward: string; outward: string; linkedIssue: string }>> {
    const data = await this.client.get<{ fields: { issuelinks: unknown[] } }>(`/issue/${key}?fields=issuelinks`);
    const rawLinks = (data.fields?.issuelinks || []) as Array<Record<string, unknown>>;
    const links = rawLinks.map(l => ({
      type: (l.type || {}) as { name: string; inward: string; outward: string },
      inwardIssue: l.inwardIssue as { key: string } | undefined,
      outwardIssue: l.outwardIssue as { key: string } | undefined,
    }));
    return links.map(link => ({
      type: link.type.name,
      inward: link.type.inward,
      outward: link.type.outward,
      linkedIssue: link.inwardIssue?.key || link.outwardIssue?.key || "",
    }));
  }

  // ─── SLM-Friendly Output ─────────────────────────────────────────────────

  /** Get a compact representation for SLM consumption */
  toSLMSummary(issues: JiraIssue[]): string {
    const lines: string[] = [];

    // Group by status
    const byStatus = new Map<string, JiraIssue[]>();
    for (const issue of issues) {
      const status = issue.status || "unknown";
      if (!byStatus.has(status)) byStatus.set(status, []);
      byStatus.get(status)!.push(issue);
    }

    for (const [status, statusIssues] of byStatus) {
      lines.push(`[${status.toUpperCase()}] (${statusIssues.length})`);
      for (const issue of statusIssues) {
        const assignee = issue.assignee ? ` @${issue.assignee}` : "";
        const points = issue.storyPoints ? ` [${issue.storyPoints}sp]` : "";
        lines.push(`  ${issue.key}: ${issue.summary} (${issue.priority})${assignee}${points}`);
      }
    }

    return lines.join("\n");
  }

  /** Generate a sprint report */
  async generateSprintReport(boardId: number): Promise<string> {
    const sprints = await this.listSprints(boardId);
    const activeSprint = sprints.find(s => s.state === "active");
    if (!activeSprint) return "No active sprint found";

    const issues = await this.getSprintIssues(activeSprint.id);
    const completed = issues.filter(i => i.status === "done");
    const inProgress = issues.filter(i => i.status === "in progress");
    const todo = issues.filter(i => i.status === "to do");

    const totalPoints = issues.reduce((s, i) => s + (i.storyPoints || 0), 0);
    const donePoints = completed.reduce((s, i) => s + (i.storyPoints || 0), 0);

    const lines = [
      `SPRINT REPORT: ${activeSprint.name}`,
      `Goal: ${activeSprint.goal || "N/A"}`,
      `Period: ${activeSprint.startDate || "?"} → ${activeSprint.endDate || "?"}`,
      "",
      `PROGRESS: ${donePoints}/${totalPoints} points (${completed.length}/${issues.length} issues)`,
      `COMPLETED: ${completed.length} | IN PROGRESS: ${inProgress.length} | TODO: ${todo.length}`,
      "",
      "COMPLETED:",
      ...completed.map(i => `  ✓ ${i.key}: ${i.summary}`),
      "",
      "IN PROGRESS:",
      ...inProgress.map(i => `  ⟳ ${i.key}: ${i.summary} @${i.assignee || "unassigned"}`),
      "",
      "TODO:",
      ...todo.map(i => `  ○ ${i.key}: ${i.summary}`),
    ];

    return lines.join("\n");
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private parseIssue(data: { id: string; key: string; self: string; fields: Record<string, unknown> }): JiraIssue {
    const f = data.fields;
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    return {
      id: data.id,
      key: data.key,
      self: data.self,
      summary: (f.summary as string) || "",
      description: f.description ? this.fromADF(f.description) : "",
      type: ((f.issuetype as { name: string })?.name || "task").toLowerCase(),
      status: ((f.status as { name: string })?.name || "to do").toLowerCase(),
      priority: ((f.priority as { name: string })?.name || "medium").toLowerCase() as JiraPriority,
      assignee: (f.assignee as { displayName: string })?.displayName,
      reporter: (f.reporter as { displayName: string })?.displayName || "Unknown",
      labels: (f.labels as string[]) || [],
      components: ((f.components as Array<{ name: string }>) || []).map(c => c.name),
      fixVersions: ((f.fixVersions as Array<{ name: string }>) || []).map(v => v.name),
      sprint: (f.sprint as { name: string })?.name,
      epicLink: (f.epic_link as string) || (f.parent as { key: string })?.key,
      storyPoints: (f.customfield_10016 as number) || undefined,
      createdAt: (f.created as string) || "",
      updatedAt: (f.updated as string) || "",
      resolvedAt: (f.resolutiondate as string) || undefined,
      dueDate: (f.duedate as string) || undefined,
      parentKey: (f.parent as { key: string })?.key,
      subtasks: ((f.subtasks as Array<{ key: string }>) || []).map(s => s.key),
      originalEstimate: (f.timetracking as { originalEstimate?: string })?.originalEstimate,
      timeSpent: (f.timetracking as { timeSpent?: string })?.timeSpent,
      webUrl: `${baseUrl}/browse/${data.key}`,
    };
  }

  /** Convert plain text to Jira ADF format */
  private toADF(text: string): unknown {
    return {
      version: 1,
      type: "doc",
      content: [{
        type: "paragraph",
        content: [{ type: "text", text }],
      }],
    };
  }

  /** Extract plain text from Jira ADF format */
  private fromADF(adf: unknown): string {
    if (typeof adf === "string") return adf;
    if (!adf || typeof adf !== "object") return "";

    const doc = adf as { content?: Array<{ content?: Array<{ text?: string }> }> };
    const lines: string[] = [];

    for (const block of doc.content || []) {
      const texts: string[] = [];
      for (const inline of block.content || []) {
        if (inline.text) texts.push(inline.text);
      }
      if (texts.length > 0) lines.push(texts.join(""));
    }

    return lines.join("\n");
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _jira: JiraClient | null = null;

export function getJiraClient(config?: JiraConfig): JiraClient | null {
  if (config) {
    _jira = new JiraClient(config);
  }
  return _jira;
}
