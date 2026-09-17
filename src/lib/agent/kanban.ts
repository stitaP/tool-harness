/**
 * Kanban Multi-Agent Orchestrator
 *
 * Manages a task board with columns (todo, in-progress, review, done, blocked).
 * Supports:
 * - Task creation with dependencies
 * - Worker assignment (human or sub-agent)
 * - Parallel task execution
 * - Dependency resolution (auto-advance when deps complete)
 * - Heartbeat monitoring
 * - Comments and status updates
 * - Attachment management
 *
 * Designed for SLMs: compact JSON board state, minimal context needed.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = "todo" | "in-progress" | "review" | "done" | "blocked" | "cancelled";
export type TaskPriority = "critical" | "high" | "medium" | "low";

export interface KanbanTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** IDs of tasks that must complete before this one can start */
  dependsOn: string[];
  /** IDs of tasks spawned by this one (children) */
  children: string[];
  /** Worker assigned to this task */
  assignee?: string;
  /** When created */
  createdAt: string;
  /** When last updated */
  updatedAt: string;
  /** When started (moved to in-progress) */
  startedAt?: string;
  /** When completed */
  completedAt?: string;
  /** Estimated duration in seconds */
  estimateSecs?: number;
  /** Actual duration in seconds */
  actualSecs?: number;
  /** Tags */
  tags: string[];
  /** Comments */
  comments: KanbanComment[];
  /** Attachments */
  attachments: KanbanAttachment[];
  /** Heartbeat: last time worker reported progress */
  lastHeartbeat?: string;
  /** Structured result when done */
  result?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
}

export interface KanbanComment {
  id: string;
  author: string;
  content: string;
  timestamp: string;
}

export interface KanbanAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  /** Inline base64 data or URL */
  data: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface KanbanBoard {
  id: string;
  name: string;
  description: string;
  tasks: KanbanTask[];
  /** Workers registered on this board */
  workers: KanbanWorker[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanWorker {
  id: string;
  name: string;
  type: "human" | "agent" | "sub-agent";
  status: "idle" | "busy" | "offline";
  currentTaskId?: string;
  capabilities: string[];
  /** Last heartbeat */
  lastHeartbeat: string;
}

export interface BoardSnapshot {
  /** Compact SLM-friendly representation */
  compact: string;
  /** Full JSON state */
  full: KanbanBoard;
  /** Stats */
  stats: {
    total: number;
    todo: number;
    inProgress: number;
    review: number;
    done: number;
    blocked: number;
    cancelled: number;
  };
}

// ─── Kanban Manager ──────────────────────────────────────────────────────────

export class KanbanManager {
  private boards: Map<string, KanbanBoard> = new Map();
  private taskCounter = 0;
  private commentCounter = 0;

  /** Create a new board */
  createBoard(name: string, description = ""): KanbanBoard {
    const id = `board-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const board: KanbanBoard = {
      id,
      name,
      description,
      tasks: [],
      workers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.boards.set(id, board);
    return board;
  }

  /** Get a board */
  getBoard(id: string): KanbanBoard | undefined {
    return this.boards.get(id);
  }

  /** List all boards */
  listBoards(): KanbanBoard[] {
    return Array.from(this.boards.values());
  }

  /** Add a task to a board */
  addTask(boardId: string, task: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    dependsOn?: string[];
    assignee?: string;
    tags?: string[];
    estimateSecs?: number;
  }): KanbanTask {
    const board = this.boards.get(boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);

    const id = `task-${++this.taskCounter}`;
    const now = new Date().toISOString();

    const kanbanTask: KanbanTask = {
      id,
      title: task.title,
      description: task.description || "",
      status: "todo",
      priority: task.priority || "medium",
      dependsOn: task.dependsOn || [],
      children: [],
      assignee: task.assignee,
      createdAt: now,
      updatedAt: now,
      estimateSecs: task.estimateSecs,
      tags: task.tags || [],
      comments: [],
      attachments: [],
    };

    // Check if blocked by dependencies
    if (task.dependsOn && task.dependsOn.length > 0) {
      const allDepsDone = task.dependsOn.every(depId => {
        const dep = board.tasks.find(t => t.id === depId);
        return dep && dep.status === "done";
      });
      if (!allDepsDone) {
        kanbanTask.status = "blocked";
      }
    }

    board.tasks.push(kanbanTask);
    board.updatedAt = now;
    return kanbanTask;
  }

  /** Move a task to a new status */
  moveTask(boardId: string, taskId: string, newStatus: TaskStatus): KanbanTask | undefined {
    const board = this.boards.get(boardId);
    if (!board) return undefined;

    const task = board.tasks.find(t => t.id === taskId);
    if (!task) return undefined;

    const now = new Date().toISOString();
    task.status = newStatus;
    task.updatedAt = now;

    if (newStatus === "in-progress") {
      task.startedAt = now;
    } else if (newStatus === "done") {
      task.completedAt = now;
      if (task.startedAt) {
        task.actualSecs = Math.round((new Date(now).getTime() - new Date(task.startedAt).getTime()) / 1000);
      }
      // Unblock dependent tasks
      this.unblockDependents(board, taskId);
    } else if (newStatus === "blocked") {
      task.error = "Blocked by dependency";
    }

    board.updatedAt = now;
    return task;
  }

  /** Assign a worker to a task */
  assignTask(boardId: string, taskId: string, workerId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;

    const task = board.tasks.find(t => t.id === taskId);
    const worker = board.workers.find(w => w.id === workerId);
    if (!task || !worker) return false;

    task.assignee = workerId;
    task.updatedAt = new Date().toISOString();
    worker.currentTaskId = taskId;
    worker.status = "busy";
    return true;
  }

  /** Register a worker */
  registerWorker(boardId: string, worker: Omit<KanbanWorker, "lastHeartbeat">): KanbanWorker {
    const board = this.boards.get(boardId);
    if (!board) throw new Error(`Board not found: ${boardId}`);

    const fullWorker: KanbanWorker = {
      ...worker,
      lastHeartbeat: new Date().toISOString(),
    };

    board.workers.push(fullWorker);
    return fullWorker;
  }

  /** Worker heartbeat */
  heartbeat(boardId: string, workerId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;

    const worker = board.workers.find(w => w.id === workerId);
    if (!worker) return false;

    worker.lastHeartbeat = new Date().toISOString();

    // Update task heartbeat too
    if (worker.currentTaskId) {
      const task = board.tasks.find(t => t.id === worker.currentTaskId);
      if (task) {
        task.lastHeartbeat = new Date().toISOString();
      }
    }

    return true;
  }

  /** Add a comment to a task */
  addComment(boardId: string, taskId: string, author: string, content: string): KanbanComment | undefined {
    const board = this.boards.get(boardId);
    if (!board) return undefined;

    const task = board.tasks.find(t => t.id === taskId);
    if (!task) return undefined;

    const comment: KanbanComment = {
      id: `cmt-${++this.commentCounter}`,
      author,
      content,
      timestamp: new Date().toISOString(),
    };

    task.comments.push(comment);
    task.updatedAt = new Date().toISOString();
    return comment;
  }

  /** Fan out child tasks from a parent */
  fanOut(boardId: string, parentId: string, subtasks: Array<{
    title: string;
    description?: string;
    priority?: TaskPriority;
    tags?: string[];
  }>): KanbanTask[] {
    const board = this.boards.get(boardId);
    if (!board) return [];

    const parent = board.tasks.find(t => t.id === parentId);
    if (!parent) return [];

    const created: KanbanTask[] = [];
    for (const sub of subtasks) {
      const task = this.addTask(boardId, {
        ...sub,
        dependsOn: [parentId],
        tags: [...(sub.tags || []), `parent:${parentId}`],
      });
      parent.children.push(task.id);
      created.push(task);
    }

    return created;
  }

  /** Get compact SLM-friendly board snapshot */
  getSnapshot(boardId: string): BoardSnapshot | undefined {
    const board = this.boards.get(boardId);
    if (!board) return undefined;

    const stats = {
      total: board.tasks.length,
      todo: board.tasks.filter(t => t.status === "todo").length,
      inProgress: board.tasks.filter(t => t.status === "in-progress").length,
      review: board.tasks.filter(t => t.status === "review").length,
      done: board.tasks.filter(t => t.status === "done").length,
      blocked: board.tasks.filter(t => t.status === "blocked").length,
      cancelled: board.tasks.filter(t => t.status === "cancelled").length,
    };

    // Build compact representation
    const lines = [
      `BOARD: ${board.name}`,
      `STATUS: ${stats.done}/${stats.total} done, ${stats.inProgress} active, ${stats.blocked} blocked`,
    ];

    // Active tasks
    const active = board.tasks.filter(t => t.status === "in-progress");
    if (active.length > 0) {
      lines.push("ACTIVE:");
      for (const t of active) {
        const age = t.startedAt ? Math.round((Date.now() - new Date(t.startedAt).getTime()) / 1000) : 0;
        lines.push(`  [${t.id}] ${t.title} (${t.priority}) ${t.assignee ? `@${t.assignee}` : "unassigned"} ${age}s`);
      }
    }

    // Blocked tasks
    const blocked = board.tasks.filter(t => t.status === "blocked");
    if (blocked.length > 0) {
      lines.push("BLOCKED:");
      for (const t of blocked) {
        lines.push(`  [${t.id}] ${t.title} (needs: ${t.dependsOn.join(", ")})`);
      }
    }

    // Todo tasks (next up)
    const todo = board.tasks.filter(t => t.status === "todo").slice(0, 5);
    if (todo.length > 0) {
      lines.push("TODO (next):");
      for (const t of todo) {
        lines.push(`  [${t.id}] ${t.title} (${t.priority})`);
      }
    }

    // Workers
    const busyWorkers = board.workers.filter(w => w.status === "busy");
    if (busyWorkers.length > 0) {
      lines.push("WORKERS:");
      for (const w of busyWorkers) {
        lines.push(`  ${w.name} (${w.type}) → ${w.currentTaskId}`);
      }
    }

    return {
      compact: lines.join("\n"),
      full: { ...board, tasks: board.tasks.map(t => ({ ...t })) },
      stats,
    };
  }

  /** Get tasks ready to start (all deps done, not started) */
  getReadyTasks(boardId: string): KanbanTask[] {
    const board = this.boards.get(boardId);
    if (!board) return [];

    return board.tasks.filter(t => {
      if (t.status !== "todo" && t.status !== "blocked") return false;
      return t.dependsOn.every(depId => {
        const dep = board.tasks.find(d => d.id === depId);
        return dep && dep.status === "done";
      });
    });
  }

  /** Detect stale workers (no heartbeat in 60s) */
  getStaleWorkers(boardId: string, staleSecs = 60): KanbanWorker[] {
    const board = this.boards.get(boardId);
    if (!board) return [];

    const now = Date.now();
    return board.workers.filter(w => {
      if (w.status !== "busy") return false;
      const lastHb = new Date(w.lastHeartbeat).getTime();
      return (now - lastHb) / 1000 > staleSecs;
    });
  }

  /** Delete a board */
  deleteBoard(id: string): boolean {
    return this.boards.delete(id);
  }

  /** Delete a task */
  deleteTask(boardId: string, taskId: string): boolean {
    const board = this.boards.get(boardId);
    if (!board) return false;
    const before = board.tasks.length;
    board.tasks = board.tasks.filter(t => t.id !== taskId);
    return board.tasks.length < before;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  /** Unblock tasks that depend on a completed task */
  private unblockDependents(board: KanbanBoard, completedTaskId: string): void {
    for (const task of board.tasks) {
      if (task.status === "blocked" && task.dependsOn.includes(completedTaskId)) {
        const allDone = task.dependsOn.every(depId => {
          const dep = board.tasks.find(t => t.id === depId);
          return dep && dep.status === "done";
        });
        if (allDone) {
          task.status = "todo";
          task.updatedAt = new Date().toISOString();
        }
      }
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _kanban: KanbanManager | null = null;

export function getKanbanManager(): KanbanManager {
  if (!_kanban) {
    _kanban = new KanbanManager();
  }
  return _kanban;
}
