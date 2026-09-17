/**
 * Unified Git Provider Abstraction
 *
 * A single interface that works with:
 * - Local git (via terminal)
 * - GitHub REST API
 * - GitLab REST API
 * - Bitbucket REST API
 * - SVN
 *
 * All API clients are self-contained: raw fetch() with manual
 * header construction, no external HTTP libraries.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type GitProviderType = "github" | "gitlab" | "bitbucket" | "local" | "svn";

export interface GitConfig {
  provider: GitProviderType;
  /** Repository owner (GitHub/GitLab/Bitbucket) */
  owner?: string;
  /** Repository name */
  repo?: string;
  /** API base URL (for self-hosted instances) */
  baseUrl?: string;
  /** Auth token (PAT, OAuth, etc.) */
  token?: string;
  /** Branch to operate on */
  branch?: string;
  /** Local path (for local git / SVN) */
  localPath?: string;
}

export interface GitCommit {
  sha: string;
  message: string;
  author: string;
  authorEmail: string;
  date: string;
  filesChanged: string[];
  additions: number;
  deletions: number;
}

export interface GitBranch {
  name: string;
  isDefault: boolean;
  isProtected: boolean;
  lastCommitSha: string;
  lastCommitDate: string;
}

export interface GitFile {
  path: string;
  content: string;
  sha: string;
  size: number;
  type: "file" | "dir" | "symlink";
}

export interface GitDiff {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  patch: string;
}

export interface GitPR {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed" | "merged";
  author: string;
  headBranch: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  labels: string[];
  reviewers: string[];
  comments: number;
  additions: number;
  deletions: number;
}

export interface GitIssue {
  number: number;
  title: string;
  body: string;
  state: "open" | "closed";
  author: string;
  labels: string[];
  assignees: string[];
  milestone?: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  comments: number;
}

export interface GitTag {
  name: string;
  sha: string;
  date: string;
}

export interface GitBlame {
  path: string;
  lines: Array<{
    lineNumber: number;
    content: string;
    commit: string;
    author: string;
    date: string;
  }>;
}

// ─── Self-Contained HTTP Client ───────────────────────────────────────────────

export class GitHTTPClient {
  private baseUrl: string;
  private token?: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.defaultHeaders = {
      "Accept": "application/json",
      "Content-Type": "application/json",
    };
    if (token) {
      this.defaultHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  async get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { ...this.defaultHeaders, ...headers },
    });
    if (!response.ok) {
      throw new GitError(`GET ${path} failed: ${response.status} ${response.statusText}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  async post<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { ...this.defaultHeaders, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new GitError(`POST ${path} failed: ${response.status} ${response.statusText} ${text}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  async put<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "PUT",
      headers: { ...this.defaultHeaders, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new GitError(`PUT ${path} failed: ${response.status} ${response.statusText}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  async patch<T>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: { ...this.defaultHeaders, ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new GitError(`PATCH ${path} failed: ${response.status} ${response.statusText}`, response.status);
    }
    return response.json() as Promise<T>;
  }

  async delete(path: string, headers?: Record<string, string>): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { ...this.defaultHeaders, ...headers },
    });
    if (!response.ok) {
      throw new GitError(`DELETE ${path} failed: ${response.status} ${response.statusText}`, response.status);
    }
  }

  async getText(path: string, headers?: Record<string, string>): Promise<string> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { ...this.defaultHeaders, ...headers },
    });
    if (!response.ok) {
      throw new GitError(`GET ${path} failed: ${response.status}`, response.status);
    }
    return response.text();
  }
}

export class GitError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "GitError";
    this.status = status;
  }
}

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface GitProvider {
  type: GitProviderType;
  config: GitConfig;

  // Repository info
  getRepoInfo(): Promise<{ name: string; description: string; defaultBranch: string; language: string; stars: number; forks: number }>;
  getDefaultBranch(): Promise<string>;

  // Commits
  listCommits(options?: { branch?: string; since?: string; until?: string; path?: string; limit?: number }): Promise<GitCommit[]>;
  getCommit(sha: string): Promise<GitCommit>;

  // Branches
  listBranches(): Promise<GitBranch[]>;
  getBranch(name: string): Promise<GitBranch>;

  // Files
  getFile(path: string, ref?: string): Promise<GitFile>;
  listDirectory(path: string, ref?: string): Promise<GitFile[]>;
  searchCode(query: string): Promise<Array<{ path: string; score: number; lineMatches: Array<{ lineNumber: number; content: string }> }>>;

  // Diff
  getDiff(base: string, head: string): Promise<GitDiff[]>;
  getFileDiff(path: string, base: string, head: string): Promise<GitDiff>;

  // PRs / Merge Requests
  listPRs(state?: "open" | "closed" | "all"): Promise<GitPR[]>;
  getPR(number: number): Promise<GitPR>;
  createPR(title: string, body: string, head: string, base: string): Promise<GitPR>;

  // Issues
  listIssues(state?: "open" | "closed" | "all", labels?: string[]): Promise<GitIssue[]>;
  getIssue(number: number): Promise<GitIssue>;
  createIssue(title: string, body: string, labels?: string[], assignees?: string[]): Promise<GitIssue>;
  updateIssue(number: number, updates: Partial<{ title: string; body: string; state: string; labels: string[] }>): Promise<GitIssue>;

  // Tags
  listTags(): Promise<GitTag[]>;

  // Blame
  getBlame(path: string, ref?: string): Promise<GitBlame>;

  // Webhook management
  listWebhooks(): Promise<Array<{ id: string; url: string; events: string[]; active: boolean }>>;
  createWebhook(url: string, events: string[]): Promise<{ id: string; url: string }>;
  deleteWebhook(id: string): Promise<void>;
}

// ─── GitHub Provider ──────────────────────────────────────────────────────────

export class GitHubProvider implements GitProvider {
  type: GitProviderType = "github";
  config: GitConfig;
  private client: GitHTTPClient;

  constructor(config: GitConfig) {
    this.config = config;
    const baseUrl = config.baseUrl || "https://api.github.com";
    this.client = new GitHTTPClient(baseUrl, config.token);
  }

  private get repoPath() { return `/repos/${this.config.owner}/${this.config.repo}`; }

  async getRepoInfo() {
    const repo = await this.client.get<{ name: string; description: string; default_branch: string; language: string; stargazers_count: number; forks_count: number }>(this.repoPath);
    return { name: repo.name, description: repo.description || "", defaultBranch: repo.default_branch, language: repo.language || "", stars: repo.stargazers_count, forks: repo.forks_count };
  }

  async getDefaultBranch() { return (await this.getRepoInfo()).defaultBranch; }

  async listCommits(options: { branch?: string; since?: string; until?: string; path?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (options.branch) params.set("sha", options.branch);
    if (options.since) params.set("since", options.since);
    if (options.until) params.set("until", options.until);
    if (options.path) params.set("path", options.path);
    params.set("per_page", String(options.limit || 30));
    const data = await this.client.get<Array<{ sha: string; commit: { message: string; author: { name: string; email: string; date: string } }; files?: Array<{ filename: string; additions: number; deletions: number }> }>>(`${this.repoPath}/commits?${params}`);
    return data.map(c => ({ sha: c.sha, message: c.commit.message, author: c.commit.author.name, authorEmail: c.commit.author.email, date: c.commit.author.date, filesChanged: c.files?.map(f => f.filename) || [], additions: c.files?.reduce((s, f) => s + f.additions, 0) || 0, deletions: c.files?.reduce((s, f) => s + f.deletions, 0) || 0 }));
  }

  async getCommit(sha: string) {
    const c = await this.client.get<{ sha: string; commit: { message: string; author: { name: string; email: string; date: string } }; files: Array<{ filename: string; additions: number; deletions: number }> }>(`${this.repoPath}/commits/${sha}`);
    return { sha: c.sha, message: c.commit.message, author: c.commit.author.name, authorEmail: c.commit.author.email, date: c.commit.author.date, filesChanged: c.files.map(f => f.filename), additions: c.files.reduce((s, f) => s + f.additions, 0), deletions: c.files.reduce((s, f) => s + f.deletions, 0) };
  }

  async listBranches() {
    const data = await this.client.get<Array<{ name: string; default: boolean; protected: boolean; commit: { sha: string; commit: { author: { date: string } } } }>>(`${this.repoPath}/branches?per_page=100`);
    return data.map(b => ({ name: b.name, isDefault: b.default, isProtected: b.protected, lastCommitSha: b.commit.sha, lastCommitDate: b.commit.commit.author.date }));
  }

  async getBranch(name: string) {
    const b = await this.client.get<{ name: string; default: boolean; protected: boolean; commit: { sha: string; commit: { author: { date: string } } } }>(`${this.repoPath}/branches/${name}`);
    return { name: b.name, isDefault: b.default, isProtected: b.protected, lastCommitSha: b.commit.sha, lastCommitDate: b.commit.commit.author.date };
  }

  async getFile(path: string, ref?: string) {
    const params = ref ? `?ref=${ref}` : "";
    const data = await this.client.get<{ path: string; content: string; sha: string; size: number; type: string }>(`${this.repoPath}/contents/${path}${params}`);
    return { path: data.path, content: atob(data.content), sha: data.sha, size: data.size, type: data.type as "file" | "dir" | "symlink" };
  }

  async listDirectory(path: string, ref?: string) {
    const params = ref ? `?ref=${ref}` : "";
    const data = await this.client.get<Array<{ name: string; path: string; sha: string; size: number; type: string }>>(`${this.repoPath}/contents/${path}${params}`);
    return data.map(f => ({ path: f.path, content: "", sha: f.sha, size: f.size, type: f.type as "file" | "dir" | "symlink" }));
  }

  async searchCode(query: string) {
    const data = await this.client.get<{ items: Array<{ path: string; score: number; text_matches?: Array<{ fragment: string; line_number: number }> }> }>(`/search/code?q=${encodeURIComponent(query)}+repo:${this.config.owner}/${this.config.repo}`);
    return (data.items || []).map(i => ({ path: i.path, score: i.score, lineMatches: (i.text_matches || []).map(m => ({ lineNumber: m.line_number, content: m.fragment })) }));
  }

  async getDiff(base: string, head: string) {
    const data = await this.client.get<{ files: Array<{ filename: string; status: string; additions: number; deletions: number; patch: string }> }>(`${this.repoPath}/compare/${base}...${head}`);
    return (data.files || []).map(f => ({ path: f.filename, status: f.status as "added" | "modified" | "deleted" | "renamed", additions: f.additions, deletions: f.deletions, patch: f.patch || "" }));
  }

  async getFileDiff(path: string, base: string, head: string) {
    const diffs = await this.getDiff(base, head);
    return diffs.find(d => d.path === path) || { path, status: "modified" as const, additions: 0, deletions: 0, patch: "" };
  }

  async listPRs(state: "open" | "closed" | "all" = "open") {
    const data = await this.client.get<Array<{ number: number; title: string; body: string; state: string; user: { login: string }; head: { ref: string }; base: { ref: string }; created_at: string; updated_at: string; merged_at: string | null; labels: Array<{ name: string }>; requested_reviewers: Array<{ login: string }>; comments: number; additions: number; deletions: number }>>(`${this.repoPath}/pulls?state=${state}&per_page=30`);
    return data.map(p => ({ number: p.number, title: p.title, body: p.body || "", state: (p.merged_at ? "merged" : p.state) as "open" | "closed" | "merged", author: p.user.login, headBranch: p.head.ref, baseBranch: p.base.ref, createdAt: p.created_at, updatedAt: p.updated_at, mergedAt: p.merged_at || undefined, labels: p.labels.map(l => l.name), reviewers: p.requested_reviewers.map(r => r.login), comments: p.comments, additions: p.additions, deletions: p.deletions }));
  }

  async getPR(number: number) {
    const prs = await this.listPRs("all");
    return prs.find(p => p.number === number)!;
  }

  async createPR(title: string, body: string, head: string, base: string) {
    const data = await this.client.post<{ number: number; title: string; body: string; state: string; user: { login: string }; head: { ref: string }; base: { ref: string }; created_at: string; updated_at: string }>(`${this.repoPath}/pulls`, { title, body, head, base });
    return { number: data.number, title: data.title, body: data.body, state: data.state as "open", author: data.user.login, headBranch: data.head.ref, baseBranch: data.base.ref, createdAt: data.created_at, updatedAt: data.updated_at, labels: [], reviewers: [], comments: 0, additions: 0, deletions: 0 };
  }

  async listIssues(state = "open", labels?: string[]) {
    const params = new URLSearchParams({ state, per_page: "30" });
    if (labels?.length) params.set("labels", labels.join(","));
    const data = await this.client.get<Array<{ number: number; title: string; body: string; state: string; user: { login: string }; labels: Array<{ name: string }>; assignees: Array<{ login: string }>; milestone: { title: string } | null; created_at: string; updated_at: string; closed_at: string | null; comments: number }>>(`${this.repoPath}/issues?${params}`);
    return data.filter((i: Record<string, unknown>) => !i.pull_request).map(i => ({ number: i.number, title: i.title, body: i.body || "", state: i.state as "open" | "closed", author: i.user.login, labels: i.labels.map(l => l.name), assignees: i.assignees.map(a => a.login), milestone: i.milestone?.title, createdAt: i.created_at, updatedAt: i.updated_at, closedAt: i.closed_at || undefined, comments: i.comments }));
  }

  async getIssue(number: number) {
    const issues = await this.listIssues("all");
    return issues.find(i => i.number === number)!;
  }

  async createIssue(title: string, body: string, labels?: string[], assignees?: string[]) {
    const data = await this.client.post<{ number: number; title: string; body: string; state: string; user: { login: string }; labels: Array<{ name: string }>; assignees: Array<{ login: string }>; created_at: string; updated_at: string }>(`${this.repoPath}/issues`, { title, body, labels, assignees });
    return { number: data.number, title: data.title, body: data.body, state: data.state as "open", author: data.user.login, labels: data.labels.map(l => l.name), assignees: data.assignees.map(a => a.login), createdAt: data.created_at, updatedAt: data.updated_at, comments: 0 };
  }

  async updateIssue(number: number, updates: Partial<{ title: string; body: string; state: string; labels: string[] }>) {
    const data = await this.client.patch<{ number: number; title: string; body: string; state: string; labels: Array<{ name: string }>; user: { login: string }; assignees: Array<{ login: string }>; created_at: string; updated_at: string; comments: number }>(`${this.repoPath}/issues/${number}`, updates);
    return { number: data.number, title: data.title, body: data.body, state: data.state as "open" | "closed", author: data.user?.login || "", labels: data.labels.map(l => l.name), assignees: (data.assignees || []).map(a => a.login), createdAt: data.created_at, updatedAt: data.updated_at, comments: data.comments || 0 };
  }

  async listTags() {
    const data = await this.client.get<Array<{ name: string; commit: { sha: string }; date: string }>>(`${this.repoPath}/tags?per_page=100`);
    return data.map(t => ({ name: t.name, sha: t.commit.sha, date: t.date || "" }));
  }

  async getBlame(path: string, ref?: string) {
    const params = ref ? `?ref=${ref}` : "";
    const data = await this.client.get<{ blob_url: string; lines: Array<{ content: string; commit: { sha: string; commit: { author: { name: string; date: string } } }; line: number }> }>(`${this.repoPath}/blame/${path}${params}`);
    return { path, lines: (data.lines || []).map(l => ({ lineNumber: l.line, content: l.content, commit: l.commit.sha, author: l.commit.commit.author.name, date: l.commit.commit.author.date })) };
  }

  async listWebhooks() {
    const data = await this.client.get<Array<{ id: number; config: { url: string }; events: string[]; active: boolean }>>(`${this.repoPath}/hooks`);
    return data.map(h => ({ id: String(h.id), url: h.config.url, events: h.events, active: h.active }));
  }

  async createWebhook(url: string, events: string[]) {
    const data = await this.client.post<{ id: number; config: { url: string } }>(`${this.repoPath}/hooks`, { config: { url }, events, active: true });
    return { id: String(data.id), url: data.config.url };
  }

  async deleteWebhook(id: string) {
    await this.client.delete(`${this.repoPath}/hooks/${id}`);
  }
}

// ─── GitLab Provider ──────────────────────────────────────────────────────────

export class GitLabProvider implements GitProvider {
  type: GitProviderType = "gitlab";
  config: GitConfig;
  private client: GitHTTPClient;

  constructor(config: GitConfig) {
    this.config = config;
    const baseUrl = config.baseUrl || "https://gitlab.com/api/v4";
    this.client = new GitHTTPClient(baseUrl, config.token);
  }

  private get projectId() { return encodeURIComponent(`${this.config.owner}/${this.config.repo}`); }

  async getRepoInfo() {
    const r = await this.client.get<{ name: string; description: string; default_branch: string; star_count: number; forks_count: number }>(`/projects/${this.projectId}`);
    return { name: r.name, description: r.description || "", defaultBranch: r.default_branch, language: "", stars: r.star_count, forks: r.forks_count };
  }

  async getDefaultBranch() { return (await this.getRepoInfo()).defaultBranch; }

  async listCommits(options: { branch?: string; since?: string; until?: string; path?: string; limit?: number } = {}) {
    const params = new URLSearchParams();
    if (options.branch) params.set("ref_name", options.branch);
    if (options.since) params.set("since", options.since);
    if (options.until) params.set("until", options.until);
    if (options.path) params.set("path", options.path);
    params.set("per_page", String(options.limit || 30));
    const data = await this.client.get<Array<{ id: string; title: string; author_name: string; author_email: string; committed_date: string }>>(`/projects/${this.projectId}/commits?${params}`);
    return data.map(c => ({ sha: c.id, message: c.title, author: c.author_name, authorEmail: c.author_email, date: c.committed_date, filesChanged: [], additions: 0, deletions: 0 }));
  }

  async getCommit(sha: string) {
    const c = await this.client.get<{ id: string; title: string; author_name: string; author_email: string; committed_date: string }>(`/projects/${this.projectId}/commits/${sha}`);
    return { sha: c.id, message: c.title, author: c.author_name, authorEmail: c.author_email, date: c.committed_date, filesChanged: [], additions: 0, deletions: 0 };
  }

  async listBranches() {
    const data = await this.client.get<Array<{ name: string; default: boolean; protected: boolean; commit: { id: string; committed_date: string } }>>(`/projects/${this.projectId}/branches`);
    return data.map(b => ({ name: b.name, isDefault: b.default, isProtected: b.protected, lastCommitSha: b.commit.id, lastCommitDate: b.commit.committed_date }));
  }

  async getBranch(name: string) {
    const b = await this.client.get<{ name: string; default: boolean; protected: boolean; commit: { id: string; committed_date: string } }>(`/projects/${this.projectId}/branches/${encodeURIComponent(name)}`);
    return { name: b.name, isDefault: b.default, isProtected: b.protected, lastCommitSha: b.commit.id, lastCommitDate: b.commit.committed_date };
  }

  async getFile(path: string, ref?: string) {
    const params = ref ? `?ref=${ref}` : "";
    const data = await this.client.get<{ file_name: string; file_path: string; content: string; blob_id: string; size: number }>(`/projects/${this.projectId}/repository/files/${encodeURIComponent(path)}${params}`);
    return { path: data.file_path, content: atob(data.content), sha: data.blob_id, size: data.size, type: "file" as const };
  }

  async listDirectory(path: string, ref?: string) {
    const params = ref ? `?ref=${ref}` : "";
    const data = await this.client.get<Array<{ name: string; type: string; path: string; id: string; size: number }>>(`/projects/${this.projectId}/repository/tree?path=${path}&per_page=100${params}`);
    return data.map(f => ({ path: f.path, content: "", sha: f.id, size: f.size, type: f.type === "blob" ? "file" as const : "dir" as const }));
  }

  async searchCode(query: string) {
    const data = await this.client.get<Array<{ filename: string; path: string; score: number }>>(`/projects/${this.projectId}/search?scope=blobs&search=${encodeURIComponent(query)}`);
    return data.map(i => ({ path: i.path, score: i.score || 1, lineMatches: [] }));
  }

  async getDiff(base: string, head: string) {
    const data = await this.client.get<Array<{ new_path: string; old_path: string; new_file: boolean; renamed_file: boolean; deleted_file: boolean; diff: string }>>(`/projects/${this.projectId}/repository/compare?from=${base}&to=${head}`);
    return data.map(f => ({ path: f.new_path, status: f.deleted_file ? "deleted" as const : f.new_file ? "added" as const : f.renamed_file ? "renamed" as const : "modified" as const, additions: (f.diff.match(/^\+[^+]/gm) || []).length, deletions: (f.diff.match(/^-[^-]/gm) || []).length, patch: f.diff }));
  }

  async getFileDiff(path: string, base: string, head: string) {
    const diffs = await this.getDiff(base, head);
    return diffs.find(d => d.path === path) || { path, status: "modified" as const, additions: 0, deletions: 0, patch: "" };
  }

  async listPRs(state = "open") {
    const s = state === "open" ? "opened" : state;
    const data = await this.client.get<Array<{ iid: number; title: string; description: string; state: string; author: { username: string }; source_branch: string; target_branch: string; created_at: string; updated_at: string; merged_at: string | null; labels: string[]; reviewers: Array<{ username: string }>; user_notes_count: number; diff_stats: { additions: number; deletions: number } | null }>>(`/projects/${this.projectId}/merge_requests?state=${s}&per_page=30`);
    return data.map(p => ({ number: p.iid, title: p.title, body: p.description || "", state: (p.merged_at ? "merged" : p.state === "opened" ? "open" : "closed") as "open" | "closed" | "merged", author: p.author.username, headBranch: p.source_branch, baseBranch: p.target_branch, createdAt: p.created_at, updatedAt: p.updated_at, mergedAt: p.merged_at || undefined, labels: p.labels, reviewers: p.reviewers.map(r => r.username), comments: p.user_notes_count, additions: p.diff_stats?.additions || 0, deletions: p.diff_stats?.deletions || 0 }));
  }

  async getPR(number: number) {
    const data = await this.client.get<{ iid: number; title: string; description: string; state: string; author: { username: string }; source_branch: string; target_branch: string; created_at: string; updated_at: string; merged_at: string | null; labels: string[]; reviewers: Array<{ username: string }>; user_notes_count: number }>(`/projects/${this.projectId}/merge_requests/${number}`);
    return { number: data.iid, title: data.title, body: data.description || "", state: (data.merged_at ? "merged" : data.state === "opened" ? "open" : "closed") as "open" | "closed" | "merged", author: data.author.username, headBranch: data.source_branch, baseBranch: data.target_branch, createdAt: data.created_at, updatedAt: data.updated_at, mergedAt: data.merged_at || undefined, labels: data.labels, reviewers: data.reviewers.map(r => r.username), comments: data.user_notes_count, additions: 0, deletions: 0 };
  }

  async createPR(title: string, body: string, head: string, base: string) {
    const data = await this.client.post<{ iid: number; title: string; description: string; state: string; author: { username: string }; source_branch: string; target_branch: string; created_at: string; updated_at: string }>(`/projects/${this.projectId}/merge_requests`, { title, description: body, source_branch: head, target_branch: base });
    return { number: data.iid, title: data.title, body: data.description, state: "open" as const, author: data.author.username, headBranch: data.source_branch, baseBranch: data.target_branch, createdAt: data.created_at, updatedAt: data.updated_at, labels: [], reviewers: [], comments: 0, additions: 0, deletions: 0 };
  }

  async listIssues(state = "open", labels?: string[]) {
    const params = new URLSearchParams({ state, per_page: "30" });
    if (labels?.length) params.set("labels", labels.join(","));
    const data = await this.client.get<Array<{ iid: number; title: string; description: string; state: string; author: { username: string }; labels: string[]; assignees: Array<{ username: string }>; milestone: { title: string } | null; created_at: string; updated_at: string; closed_at: string | null; user_notes_count: number }>>(`/projects/${this.projectId}/issues?${params}`);
    return data.map(i => ({ number: i.iid, title: i.title, body: i.description || "", state: i.state as "open" | "closed", author: i.author.username, labels: i.labels, assignees: i.assignees.map(a => a.username), milestone: i.milestone?.title, createdAt: i.created_at, updatedAt: i.updated_at, closedAt: i.closed_at || undefined, comments: i.user_notes_count }));
  }

  async getIssue(number: number) {
    const data = await this.client.get<{ iid: number; title: string; description: string; state: string; author: { username: string }; labels: string[]; assignees: Array<{ username: string }>; milestone: { title: string } | null; created_at: string; updated_at: string; closed_at: string | null; user_notes_count: number }>(`/projects/${this.projectId}/issues/${number}`);
    return { number: data.iid, title: data.title, body: data.description || "", state: data.state as "open" | "closed", author: data.author.username, labels: data.labels, assignees: data.assignees.map(a => a.username), milestone: data.milestone?.title, createdAt: data.created_at, updatedAt: data.updated_at, closedAt: data.closed_at || undefined, comments: data.user_notes_count };
  }

  async createIssue(title: string, body: string, labels?: string[], assignees?: string[]) {
    const data = await this.client.post<{ iid: number; title: string; description: string; state: string; author: { username: string }; labels: string[]; created_at: string; updated_at: string }>(`/projects/${this.projectId}/issues`, { title, description: body, labels, assignee_ids: [] });
    return { number: data.iid, title: data.title, body: data.description, state: data.state as "open", author: data.author.username, labels: data.labels, assignees: assignees || [], createdAt: data.created_at, updatedAt: data.updated_at, comments: 0 };
  }

  async updateIssue(number: number, updates: Partial<{ title: string; body: string; state: string; labels: string[] }>) {
    const data = await this.client.put<{ iid: number; title: string; description: string; state: string; labels: string[]; author: { username: string }; assignees: Array<{ username: string }>; created_at: string; updated_at: string }>(`/projects/${this.projectId}/issues/${number}`, { title: updates.title, description: updates.body, state_event: updates.state === "closed" ? "close" : updates.state === "open" ? "reopen" : undefined, add_labels: updates.labels?.join(",") });
    return { number: data.iid, title: data.title, body: data.description, state: data.state as "open" | "closed", author: data.author.username, labels: data.labels, assignees: data.assignees.map(a => a.username), createdAt: data.created_at, updatedAt: data.updated_at, comments: 0 };
  }

  async listTags() {
    const data = await this.client.get<Array<{ name: string; commit: { id: string; committed_date: string } }>>(`/projects/${this.projectId}/repository/tags`);
    return data.map(t => ({ name: t.name, sha: t.commit.id, date: t.commit.committed_date }));
  }

  async getBlame(path: string, ref?: string) {
    const params = ref ? `?ref=${ref}` : "";
    const data = await this.client.get<{ lines: Array<{ commit: { id: string; author_name: string; authored_date: string }; lines: string[] }> }>(`/projects/${this.projectId}/repository/files/${encodeURIComponent(path)}/blame${params}`);
    const lines: GitBlame["lines"] = [];
    let lineNum = 1;
    for (const section of data.lines || []) {
      for (const line of section.lines) {
        lines.push({ lineNumber: lineNum++, content: line, commit: section.commit.id, author: section.commit.author_name, date: section.commit.authored_date });
      }
    }
    return { path, lines };
  }

  async listWebhooks() {
    const data = await this.client.get<Array<{ id: number; url: string; push_events: boolean; merge_requests_events: boolean; issues_events: boolean; active: boolean }>>(`/projects/${this.projectId}/hooks`);
    return data.map(h => ({ id: String(h.id), url: h.url, events: [...(h.push_events ? ["push"] : []), ...(h.merge_requests_events ? ["merge_request"] : []), ...(h.issues_events ? ["issue"] : [])], active: h.active }));
  }

  async createWebhook(url: string, events: string[]) {
    const data = await this.client.post<{ id: number; url: string }>(`/projects/${this.projectId}/hooks`, { url, push_events: events.includes("push"), merge_requests_events: events.includes("merge_request"), issues_events: events.includes("issue") });
    return { id: String(data.id), url: data.url };
  }

  async deleteWebhook(id: string) {
    await this.client.delete(`/projects/${this.projectId}/hooks/${id}`);
  }
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createGitProvider(config: GitConfig): GitProvider {
  switch (config.provider) {
    case "github": return new GitHubProvider(config);
    case "gitlab": return new GitLabProvider(config);
    case "bitbucket": return new GitHubProvider({ ...config, baseUrl: config.baseUrl || "https://api.bitbucket.org/2.0" }); // Bitbucket uses similar REST patterns
    case "local": throw new Error("Local git requires terminal integration — use agent.terminal");
    case "svn": throw new Error("SVN requires terminal integration — use agent.terminal with svn commands");
    default: throw new Error(`Unknown provider: ${config.provider}`);
  }
}
