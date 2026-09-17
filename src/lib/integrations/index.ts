// ─── Integrations ─────────────────────────────────────────────────────────────

export type {
  GitProviderType,
  GitConfig,
  GitCommit,
  GitBranch,
  GitFile,
  GitDiff,
  GitPR,
  GitIssue,
  GitTag,
  GitBlame,
} from "./git-provider";

export {
  GitHTTPClient,
  GitError,
  GitHubProvider,
  GitLabProvider,
  createGitProvider,
} from "./git-provider";

export type {
  WikiPage,
  WikiConfig,
  WikiStructure,
} from "./wiki-generator";

export { WikiGenerator, getWikiGenerator } from "./wiki-generator";

export type {
  JiraConfig,
  JiraIssueType,
  JiraPriority,
  JiraIssueStatus,
  JiraIssue,
  JiraComment,
  JiraTransition,
  JiraSprint,
  JiraBoard,
  JiraSearchResult,
  JiraWorklog,
} from "./jira-client";

export { JiraClient, getJiraClient } from "./jira-client";

export type {
  PromptTemplate,
  SlashCommand,
  IntegrationPreset,
} from "./prompts";

export {
  PROMPT_TEMPLATES,
  SLASH_COMMANDS,
  INTEGRATION_PRESETS,
  PromptEngine,
  getPromptEngine,
} from "./prompts";
