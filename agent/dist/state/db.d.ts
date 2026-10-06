export interface ToolCall {
    id: string;
    name: string;
    arguments: string;
}
export interface Msg {
    id?: number;
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    tool_calls?: ToolCall[] | null;
    tool_call_id?: string | null;
    name?: string | null;
    created_at?: number;
    meta?: Record<string, any> | null;
}
export interface Session {
    id: string;
    title: string;
    source: string;
    parent_id: string | null;
    cwd: string;
    model: string;
    system_prompt: string | null;
    created_at: number;
    updated_at: number;
    meta: Record<string, any>;
}
export interface SearchHit {
    session_id: string;
    message_id: number;
    role: string;
    snippet: string;
    created_at: number;
    title: string;
}
/** cached_tokens: part of input_tokens the server reused from its prompt cache (llama.cpp cache_n) instead of computing. */
export interface UsageRow {
    session_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cached_tokens?: number;
    kind: string;
    created_at: number;
}
export interface StateDB {
    readonly backend: "sqlite" | "json";
    createSession(p: Partial<Session> & {
        source: string;
    }): Session;
    getSession(id: string): Session | null;
    /** archived: false (default) hides archived chats, true lists only them */
    listSessions(opts?: {
        limit?: number;
        source?: string;
        includeChildren?: boolean;
        archived?: boolean;
    }): Session[];
    /** this session and all chats started from it (pipeline documents, subagents), recursively */
    sessionTree(id: string): string[];
    updateSession(id: string, patch: Partial<Session>): void;
    deleteSession(id: string): void;
    addMessage(sessionId: string, m: Msg): number;
    getMessages(sessionId: string, opts?: {
        includeArchived?: boolean;
    }): Msg[];
    archiveMessages(ids: number[]): void;
    search(query: string, limit?: number): SearchHit[];
    getMeta<T = any>(key: string): T | null;
    setMeta(key: string, value: any): void;
    deleteMeta(key: string): void;
    listMeta(prefix: string): {
        key: string;
        value: any;
    }[];
    addUsage(u: Omit<UsageRow, "created_at">): void;
    usageSince(sinceMs: number, sessionId?: string): UsageRow[];
    putRecord(kind: string, id: string, data: any): void;
    getRecord<T = any>(kind: string, id: string): T | null;
    listRecords<T = any>(kind: string): T[];
    deleteRecord(kind: string, id: string): void;
    close(): void;
}
/** Build an FTS5 query from free text: words AND-ed, each a prefix match. */
export declare function ftsQuery(q: string): string;
export declare function openState(home: string, opts?: {
    forceJson?: boolean;
}): StateDB;
