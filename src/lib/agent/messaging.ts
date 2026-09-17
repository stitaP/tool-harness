/**
 * stitaP Async Messaging System
 *
 * Implements AutoGen v0.4's asynchronous, event-driven architecture for
 * agent communication. Supports both event-driven and request/response
 * interaction patterns.
 *
 * Key features:
 * - Async message passing between agents
 * - Event-driven and request/response patterns
 * - Message routing and filtering
 * - Dead letter queue for failed messages
 * - Message history and replay
 * - Cross-boundary communication (organizational, network)
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type MessagePriority = "low" | "normal" | "high" | "critical";
export type MessageStatus = "pending" | "processing" | "completed" | "failed" | "dead-letter";
export type InteractionPattern = "event-driven" | "request-response" | "pub-sub" | "broadcast";

export interface AgentMessage {
  id: string;
  from: string;
  to: string | string[]; // single agent or broadcast
  topic: string;
  payload: unknown;
  priority: MessagePriority;
  pattern: InteractionPattern;
  correlationId?: string; // for request-response pairing
  replyTo?: string; // for request-response
  timestamp: string;
  ttlMs?: number; // time to live
  retryCount: number;
  maxRetries?: number;
  status?: MessageStatus;
  metadata: Record<string, unknown>;
}

export interface MessageHandler {
  topic: string;
  agentId: string;
  callback: (message: AgentMessage) => Promise<unknown>;
  filter?: (message: AgentMessage) => boolean;
}

export interface MessageBusConfig {
  maxQueueSize: number;
  defaultTtlMs: number;
  defaultMaxRetries: number;
  deadLetterQueueEnabled: boolean;
  persistenceEnabled: boolean;
  metricsEnabled: boolean;
}

export interface MessageMetrics {
  totalSent: number;
  totalReceived: number;
  totalFailed: number;
  totalDeadLetter: number;
  avgLatencyMs: number;
  byTopic: Record<string, number>;
  byAgent: Record<string, number>;
}

// ─── Message Bus ────────────────────────────────────────────────────────────

export class MessageBus {
  private handlers = new Map<string, MessageHandler[]>();
  private queue: AgentMessage[] = [];
  private deadLetterQueue: AgentMessage[] = [];
  private history: AgentMessage[] = [];
  private config: MessageBusConfig;
  private metrics: MessageMetrics;
  private processing = false;

  constructor(config: Partial<MessageBusConfig> = {}) {
    this.config = {
      maxQueueSize: 10000,
      defaultTtlMs: 300_000, // 5 minutes
      defaultMaxRetries: 3,
      deadLetterQueueEnabled: true,
      persistenceEnabled: false,
      metricsEnabled: true,
      ...config,
    };

    this.metrics = {
      totalSent: 0,
      totalReceived: 0,
      totalFailed: 0,
      totalDeadLetter: 0,
      avgLatencyMs: 0,
      byTopic: {},
      byAgent: {},
    };
  }

  /** Register a handler for a topic */
  subscribe(handler: MessageHandler): () => void {
    const topic = handler.topic;
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, []);
    }
    this.handlers.get(topic)!.push(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.handlers.get(topic);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    };
  }

  /** Send a message (fire-and-forget for event-driven) */
  async publish(message: Omit<AgentMessage, "id" | "timestamp" | "retryCount">): Promise<string> {
    const fullMessage: AgentMessage = {
      ...message,
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: message.maxRetries ?? this.config.defaultMaxRetries,
      ttlMs: message.ttlMs ?? this.config.defaultTtlMs,
    };

    // Check queue capacity
    if (this.queue.length >= this.config.maxQueueSize) {
      throw new Error("Message queue full");
    }

    this.queue.push(fullMessage);
    this.metrics.totalSent++;

    // Track metrics
    if (this.config.metricsEnabled) {
      this.metrics.byTopic[message.topic] = (this.metrics.byTopic[message.topic] ?? 0) + 1;
      const from = message.from;
      this.metrics.byAgent[from] = (this.metrics.byAgent[from] ?? 0) + 1;
    }

    // Process queue
    if (!this.processing) {
      void this.processQueue();
    }

    return fullMessage.id;
  }

  /** Send a message and wait for response (request-response) */
  async request(
    message: Omit<AgentMessage, "id" | "timestamp" | "retryCount" | "correlationId">,
    timeoutMs = 30_000,
  ): Promise<unknown> {
    const correlationId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request ${correlationId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      // Subscribe to response
      const unsub = this.subscribe({
        topic: `${message.topic}.response`,
        agentId: "system",
        callback: async (response) => {
          if (response.correlationId === correlationId) {
            clearTimeout(timeout);
            unsub();
            resolve(response.payload);
          }
          return null;
        },
        filter: (msg) => msg.correlationId === correlationId,
      });

      // Send request
      void this.publish({
        ...message,
        correlationId,
        replyTo: `${message.topic}.response`,
        pattern: "request-response",
      });
    });
  }

  /** Process the message queue */
  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const message = this.queue.shift()!;
      await this.processMessage(message);
    }

    this.processing = false;
  }

  /** Process a single message */
  private async processMessage(message: AgentMessage): Promise<void> {
    // Check TTL
    const age = Date.now() - new Date(message.timestamp).getTime();
    if (message.ttlMs && age > message.ttlMs) {
      this.moveToDeadLetter(message, "TTL expired");
      return;
    }

    // Find handlers
    const handlers = this.handlers.get(message.topic) ?? [];
    const targetHandlers = Array.isArray(message.to)
      ? handlers.filter((h) => (message.to as string[]).includes(h.agentId))
      : handlers.filter((h) => h.agentId === message.to || h.agentId === "*");

    if (targetHandlers.length === 0) {
      // No handlers - check if we should retry
      if (message.retryCount < (message.maxRetries ?? 3)) {
        message.retryCount++;
        this.queue.push(message); // Re-queue
      } else {
        this.moveToDeadLetter(message, "No handlers found");
      }
      return;
    }

    // Execute handlers
    for (const handler of targetHandlers) {
      try {
        // Apply filter if present
        if (handler.filter && !handler.filter(message)) {
          continue;
        }

        const startTime = Date.now();
        await handler.callback(message);
        const latency = Date.now() - startTime;

        // Update metrics
        if (this.config.metricsEnabled) {
          this.metrics.totalReceived++;
          this.metrics.avgLatencyMs =
            (this.metrics.avgLatencyMs * (this.metrics.totalReceived - 1) + latency) /
            this.metrics.totalReceived;
        }

        // Send response if request-response pattern
        if (message.pattern === "request-response" && message.replyTo) {
          void this.publish({
            from: handler.agentId,
            to: message.from,
            topic: message.replyTo,
            payload: null, // Handler should set this
            priority: "normal",
            pattern: "event-driven",
            correlationId: message.correlationId,
            metadata: {},
          });
        }
      } catch (error) {
        this.metrics.totalFailed++;

        if (message.retryCount < (message.maxRetries ?? 3)) {
          message.retryCount++;
          this.queue.push(message); // Retry
        } else {
          this.moveToDeadLetter(message, error instanceof Error ? error.message : String(error));
        }
      }
    }

    // Store in history
    this.history.push(message);
    if (this.history.length > 10000) {
      this.history = this.history.slice(-5000);
    }
  }

  /** Move message to dead letter queue */
  private moveToDeadLetter(message: AgentMessage, reason: string): void {
    if (this.config.deadLetterQueueEnabled) {
      message.status = "dead-letter";
      message.metadata.deadLetterReason = reason;
      this.deadLetterQueue.push(message);
      this.metrics.totalDeadLetter++;
    }
  }

  /** Get metrics */
  getMetrics(): MessageMetrics {
    return { ...this.metrics };
  }

  /** Get message history */
  getHistory(limit = 100): AgentMessage[] {
    return this.history.slice(-limit);
  }

  /** Get dead letter queue */
  getDeadLetters(): AgentMessage[] {
    return [...this.deadLetterQueue];
  }

  /** Retry a dead letter message */
  retryDeadLetter(messageId: string): boolean {
    const idx = this.deadLetterQueue.findIndex((m) => m.id === messageId);
    if (idx < 0) return false;

    const message = this.deadLetterQueue.splice(idx, 1)[0];
    message.status = "pending";
    message.retryCount = 0;
    this.queue.push(message);
    return true;
  }

  /** Clear all queues */
  clear(): void {
    this.queue = [];
    this.deadLetterQueue = [];
    this.history = [];
  }
}

// ─── Agent Communication Layer ──────────────────────────────────────────────

export interface CommunicatingAgent {
  id: string;
  name: string;
  role: string;
  sendMessage(to: string, topic: string, payload: unknown): Promise<string>;
  onRequest(topic: string, handler: (payload: unknown) => Promise<unknown>): void;
  onEvent(topic: string, handler: (payload: unknown) => Promise<void>): void;
}

export function createCommunicatingAgent(
  agentId: string,
  agentName: string,
  agentRole: string,
  bus: MessageBus,
): CommunicatingAgent {
  return {
    id: agentId,
    name: agentName,
    role: agentRole,

    async sendMessage(to: string, topic: string, payload: unknown): Promise<string> {
      return bus.publish({
        from: agentId,
        to,
        topic,
        payload,
        priority: "normal",
        pattern: "event-driven",
        metadata: { agentName, agentRole },
      });
    },

    onRequest(topic: string, handler: (payload: unknown) => Promise<unknown>): void {
      bus.subscribe({
        topic,
        agentId: agentId,
        callback: async (message) => {
          const response = await handler(message.payload);
          // Send response back
          if (message.replyTo) {
            void bus.publish({
              from: agentId,
              to: message.from,
              topic: message.replyTo,
              payload: response,
              priority: "normal",
              pattern: "event-driven",
              correlationId: message.correlationId,
              metadata: {},
            });
          }
          return response;
        },
      });
    },

    onEvent(topic: string, handler: (payload: unknown) => Promise<void>): void {
      bus.subscribe({
        topic,
        agentId: agentId,
        callback: async (message) => {
          await handler(message.payload);
        },
      });
    },
  };
}
