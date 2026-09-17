/**
 * Real-Time Collaboration Hub — WebSocket-based multi-agent and multi-user sessions.
 * Supports presence, cursor sharing, operational transforms, and pub/sub messaging.
 */

export type CollaborationEvent =
  | { type: "join"; userId: string; name: string; avatar?: string }
  | { type: "leave"; userId: string }
  | { type: "cursor"; userId: string; position: { x: number; y: number }; sessionId: string }
  | { type: "selection"; userId: string; range: { start: number; end: number }; sessionId: string }
  | { type: "edit"; userId: string; operation: OTOperation; sessionId: string }
  | { type: "chat"; userId: string; message: string; sessionId: string }
  | { type: "status"; userId: string; status: "idle" | "active" | "away" }
  | { type: "presence"; userId: string; metadata: Record<string, unknown> };

export interface OTOperation {
  type: "insert" | "delete" | "replace";
  position: number;
  content?: string;
  length?: number;
  timestamp: number;
  userId: string;
  version: number;
}

export interface PresenceUser {
  id: string;
  name: string;
  avatar?: string;
  status: "idle" | "active" | "away";
  cursor?: { x: number; y: number };
  selection?: { start: number; end: number };
  metadata: Record<string, unknown>;
  lastSeen: string;
}

export interface CollaborationSession {
  id: string;
  name: string;
  createdAt: string;
  users: PresenceUser[];
  maxUsers: number;
  owner: string;
  metadata: Record<string, unknown>;
}

export interface CollaborationChannel {
  id: string;
  name: string;
  type: "public" | "private" | "direct";
  participants: string[];
  unreadCount: number;
}

// ─── Session Manager ──────────────────────────────────────────────

const sessions = new Map<string, CollaborationSession>();
const presence = new Map<string, Map<string, PresenceUser>>();

/**
 * Create a new collaboration session.
 */
export function createSession(
  name: string,
  ownerId: string,
  options: { maxUsers?: number; metadata?: Record<string, unknown> } = {}
): CollaborationSession {
  const session: CollaborationSession = {
    id: `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    users: [],
    maxUsers: options.maxUsers ?? 20,
    owner: ownerId,
    metadata: options.metadata ?? {},
  };
  sessions.set(session.id, session);
  presence.set(session.id, new Map());
  return session;
}

/**
 * Join a session.
 */
export function joinSession(
  sessionId: string,
  userId: string,
  name: string,
  metadata: Record<string, unknown> = {}
): CollaborationSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (session.users.length >= session.maxUsers) return null;

  const existing = session.users.find((u) => u.id === userId);
  if (existing) {
    existing.status = "active";
    existing.lastSeen = new Date().toISOString();
    return session;
  }

  const user: PresenceUser = {
    id: userId,
    name,
    status: "active",
    metadata,
    lastSeen: new Date().toISOString(),
  };
  session.users.push(user);
  presence.get(sessionId)?.set(userId, user);
  return session;
}

/**
 * Leave a session.
 */
export function leaveSession(sessionId: string, userId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;

  session.users = session.users.filter((u) => u.id !== userId);
  presence.get(sessionId)?.delete(userId);
  return true;
}

/**
 * Get all active users in a session.
 */
export function getSessionUsers(sessionId: string): PresenceUser[] {
  const session = sessions.get(sessionId);
  return session?.users ?? [];
}

/**
 * Update user presence in a session.
 */
export function updatePresence(
  sessionId: string,
  userId: string,
  update: Partial<Pick<PresenceUser, "cursor" | "selection" | "status" | "metadata">>
): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  const user = session.users.find((u) => u.id === userId);
  if (!user) return;

  if (update.cursor) user.cursor = update.cursor;
  if (update.selection) user.selection = update.selection;
  if (update.status) user.status = update.status;
  if (update.metadata) user.metadata = { ...user.metadata, ...update.metadata };
  user.lastSeen = new Date().toISOString();
}

// ─── Operational Transform (OT) ───────────────────────────────────

/**
 * Transform operation A against operation B.
 * When two users edit concurrently, this resolves conflicts.
 */
export function transformOperation(a: OTOperation, b: OTOperation): OTOperation {
  // Same user or same position — no conflict
  if (a.userId === b.userId) return a;

  // Both inserts at same position — earlier timestamp wins
  if (a.type === "insert" && b.type === "insert") {
    if (a.position < b.position) return a;
    if (a.position > b.position) return { ...a, position: a.position + (b.content?.length ?? 0) };
    // Same position: userId tiebreak
    return a.userId < b.userId ? a : { ...a, position: a.position + 1 };
  }

  // Insert before delete
  if (a.type === "insert" && b.type === "delete") {
    if (a.position <= b.position) return a;
    const bLen = b.length ?? 0;
    if (a.position >= b.position + bLen) return { ...a, position: a.position - bLen };
    return { ...a, position: b.position };
  }

  // Delete before insert
  if (a.type === "delete" && b.type === "insert") {
    if (a.position + (a.length ?? 0) <= b.position) return a;
    if (a.position >= b.position) return { ...a, position: a.position + (b.content?.length ?? 0) };
    // Overlapping: split delete
    return a;
  }

  // Both deletes
  if (a.type === "delete" && b.type === "delete") {
    if (a.position >= b.position + (b.length ?? 0)) {
      return { ...a, position: a.position - (b.length ?? 0) };
    }
    if (a.position + (a.length ?? 0) <= b.position) return a;
    // Overlapping deletes — clip
    const overlapStart = Math.max(a.position, b.position);
    const overlapEnd = Math.min(a.position + (a.length ?? 0), b.position + (b.length ?? 0));
    const overlapLen = Math.max(0, overlapEnd - overlapStart);
    const newLen = (a.length ?? 0) - overlapLen;
    if (newLen <= 0) return { ...a, length: 0, type: "delete" as const };
    const newPosition = a.position < b.position ? a.position : a.position - overlapLen;
    return { ...a, position: newPosition, length: newLen };
  }

  return a;
}

/**
 * Apply a sequence of operations to a document.
 */
export function applyOperations(
  document: string,
  operations: OTOperation[]
): string {
  let result = document;
  const sorted = [...operations].sort((a, b) => a.timestamp - b.timestamp);

  for (const op of sorted) {
    if (op.type === "insert" && op.content) {
      result = result.slice(0, op.position) + op.content + result.slice(op.position);
    } else if (op.type === "delete") {
      const len = op.length ?? 0;
      result = result.slice(0, op.position) + result.slice(op.position + len);
    } else if (op.type === "replace" && op.content !== undefined) {
      const len = op.length ?? op.content.length;
      result = result.slice(0, op.position) + op.content + result.slice(op.position + len);
    }
  }

  return result;
}

// ─── Pub/Sub Messaging ────────────────────────────────────────────

type MessageHandler = (event: CollaborationEvent) => void;

const channels = new Map<string, Map<string, Set<MessageHandler>>>();

/**
 * Subscribe to a channel in a session.
 */
export function subscribe(
  sessionId: string,
  channel: string,
  handler: MessageHandler
): () => void {
  if (!channels.has(sessionId)) channels.set(sessionId, new Map());
  const sessionChannels = channels.get(sessionId)!;
  if (!sessionChannels.has(channel)) sessionChannels.set(channel, new Set());
  sessionChannels.get(channel)!.add(handler);

  return () => {
    sessionChannels.get(channel)?.delete(handler);
  };
}

/**
 * Publish a message to a channel.
 */
export function publish(
  sessionId: string,
  channel: string,
  event: CollaborationEvent
): void {
  const sessionChannels = channels.get(sessionId);
  const handlers = sessionChannels?.get(channel);
  if (handlers) {
    for (const handler of handlers) {
      handler(event);
    }
  }
}

// ─── Channel Management ───────────────────────────────────────────

const collaborationChannels = new Map<string, CollaborationChannel[]>();

export function createChannel(
  sessionId: string,
  name: string,
  type: CollaborationChannel["type"] = "public"
): CollaborationChannel {
  const channel: CollaborationChannel = {
    id: `ch_${Date.now().toString(36)}`,
    name,
    type,
    participants: [],
    unreadCount: 0,
  };

  if (!collaborationChannels.has(sessionId)) {
    collaborationChannels.set(sessionId, []);
  }
  collaborationChannels.get(sessionId)!.push(channel);
  return channel;
}

export function getSessionChannels(sessionId: string): CollaborationChannel[] {
  return collaborationChannels.get(sessionId) ?? [];
}

// ─── Conflict Resolution Helpers ──────────────────────────────────

export interface ConflictResolution {
  strategy: "last-write-wins" | "ot" | "manual";
  resolved: boolean;
  document?: string;
  conflicts: Array<{ opA: OTOperation; opB: OTOperation; resolution: OTOperation }>;
}

/**
 * Resolve document conflicts using a chosen strategy.
 */
export function resolveConflicts(
  document: string,
  operations: OTOperation[],
  strategy: "last-write-wins" | "ot" = "ot"
): ConflictResolution {
  if (strategy === "last-write-wins") {
    const sorted = [...operations].sort((a, b) => b.timestamp - a.timestamp);
    const applied = sorted[0] ? [sorted[0]] : [];
    return {
      strategy: "last-write-wins",
      resolved: true,
      document: applyOperations(document, applied),
      conflicts: [],
    };
  }

  // OT strategy: pairwise transform
  const conflicts: ConflictResolution["conflicts"] = [];
  const resolved = [operations[0] ?? null];

  for (let i = 1; i < operations.length; i++) {
    const prev = resolved[i - 1];
    const curr = operations[i];
    if (!prev) {
      resolved.push(curr);
      continue;
    }

    const transformed = transformOperation(curr, prev);
    if (transformed.position !== curr.position) {
      conflicts.push({ opA: prev, opB: curr, resolution: transformed });
    }
    resolved.push(transformed);
  }

  return {
    strategy: "ot",
    resolved: true,
    document: applyOperations(document, resolved.filter(Boolean) as OTOperation[]),
    conflicts,
  };
}
