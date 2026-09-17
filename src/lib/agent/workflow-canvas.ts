/**
 * Visual Workflow Canvas — Google Opal-style
 *
 * A visual, node-based engine for building, chaining, and deploying
 * generative AI workflows without code.
 *
 * Key capabilities:
 * - Node-based workflow graph definition
 * - Drag-and-drop node connections
 * - Stateful data passing between nodes
 * - Multiple node types (LLM, Tool, Condition, Loop, Output)
 * - Execution engine that runs the workflow graph
 * - Export to runnable format
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type NodeType =
  | "llm"           // LLM prompt → response
  | "tool"          // Tool invocation
  | "condition"     // If/else branching
  | "loop"          // Iterate over data
  | "merge"         // Combine multiple inputs
  | "split"         // Fan out to multiple paths
  | "transform"     // Data transformation
  | "input"         // User input / trigger
  | "output"        // Final output / display
  | "memory"        // Read/write to memory
  | "http"          // HTTP request
  | "code"          // Custom code execution
  | "delay"         // Wait/delay
  | "gate";         // Approval gate

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  /** Position on canvas [x, y] */
  position: [number, number];
  /** Node-specific configuration */
  config: Record<string, unknown>;
  /** Input ports */
  inputs: string[];
  /** Output ports */
  outputs: string[];
  /** Whether this node is enabled */
  enabled: boolean;
}

export interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  sourcePort: string;
  targetNodeId: string;
  targetPort: string;
  /** Label for the edge (e.g., "true", "false" for conditions) */
  label?: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  /** All nodes in the workflow */
  nodes: WorkflowNode[];
  /** All edges connecting nodes */
  edges: WorkflowEdge[];
  /** Global variables available to all nodes */
  variables: Record<string, unknown>;
  /** Trigger type */
  trigger: "manual" | "scheduled" | "webhook" | "event";
  /** Created at */
  createdAt: string;
  /** Last modified */
  modifiedAt: string;
}

export interface NodeExecutionResult {
  nodeId: string;
  status: "completed" | "failed" | "skipped";
  output: unknown;
  error?: string;
  durationMs: number;
  tokensUsed: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed" | "paused";
  /** Results for each node */
  nodeResults: Map<string, NodeExecutionResult>;
  /** Current execution state */
  currentState: Record<string, unknown>;
  /** Execution trace (order of nodes executed) */
  trace: string[];
  /** Total tokens used */
  totalTokens: number;
  /** Total duration */
  durationMs: number;
}

// ─── Node Definitions ───────────────────────────────────────────────────────

export const NODE_TEMPLATES: Record<NodeType, {
  label: string;
  color: string;
  icon: string;
  defaultConfig: Record<string, unknown>;
  defaultInputs: string[];
  defaultOutputs: string[];
}> = {
  llm: {
    label: "LLM Prompt",
    color: "#8b5cf6",
    icon: "Brain",
    defaultConfig: { model: "auto", prompt: "", temperature: 0.7, maxTokens: 2048 },
    defaultInputs: ["input"],
    defaultOutputs: ["output"],
  },
  tool: {
    label: "Tool Call",
    color: "#06b6d4",
    icon: "Wrench",
    defaultConfig: { toolId: "", params: {} },
    defaultInputs: ["input"],
    defaultOutputs: ["output"],
  },
  condition: {
    label: "Condition",
    color: "#f59e0b",
    icon: "GitBranch",
    defaultConfig: { expression: "", operator: "contains" },
    defaultInputs: ["input"],
    defaultOutputs: ["true", "false"],
  },
  loop: {
    label: "Loop",
    color: "#10b981",
    icon: "Repeat",
    defaultConfig: { iterable: "", maxIterations: 10 },
    defaultInputs: ["input", "iterate"],
    defaultOutputs: ["item", "done"],
  },
  merge: {
    label: "Merge",
    color: "#6366f1",
    icon: "Merge",
    defaultConfig: { strategy: "concat" },
    defaultInputs: ["a", "b"],
    defaultOutputs: ["output"],
  },
  split: {
    label: "Split",
    color: "#ec4899",
    icon: "Split",
    defaultConfig: { paths: 2 },
    defaultInputs: ["input"],
    defaultOutputs: ["a", "b"],
  },
  transform: {
    label: "Transform",
    color: "#14b8a6",
    icon: "Transform",
    defaultConfig: { expression: "" },
    defaultInputs: ["input"],
    defaultOutputs: ["output"],
  },
  input: {
    label: "User Input",
    color: "#3b82f6",
    icon: "MessageSquare",
    defaultConfig: { prompt: "Enter value:", type: "text" },
    defaultInputs: [],
    defaultOutputs: ["output"],
  },
  output: {
    label: "Output",
    color: "#ef4444",
    icon: "Send",
    defaultConfig: { format: "text" },
    defaultInputs: ["input"],
    defaultOutputs: [],
  },
  memory: {
    label: "Memory",
    color: "#a855f7",
    icon: "Database",
    defaultConfig: { operation: "read", key: "" },
    defaultInputs: ["input"],
    defaultOutputs: ["output"],
  },
  http: {
    label: "HTTP Request",
    color: "#f97316",
    icon: "Globe",
    defaultConfig: { url: "", method: "GET", headers: {}, body: "" },
    defaultInputs: ["input"],
    defaultOutputs: ["output"],
  },
  code: {
    label: "Custom Code",
    color: "#64748b",
    icon: "Code",
    defaultConfig: { language: "javascript", code: "" },
    defaultInputs: ["input"],
    defaultOutputs: ["output"],
  },
  delay: {
    label: "Delay",
    color: "#78716c",
    icon: "Clock",
    defaultConfig: { durationMs: 1000 },
    defaultInputs: ["input"],
    defaultOutputs: ["output"],
  },
  gate: {
    label: "Approval Gate",
    color: "#dc2626",
    icon: "Shield",
    defaultConfig: { message: "Approve?", autoApprove: false },
    defaultInputs: ["input"],
    defaultOutputs: ["approved", "rejected"],
  },
};

// ─── Workflow Builder ───────────────────────────────────────────────────────

export class WorkflowBuilder {
  private workflows = new Map<string, WorkflowDefinition>();
  private executions = new Map<string, WorkflowExecution>();

  /**
   * Create a new workflow.
   */
  createWorkflow(name: string, description = ""): WorkflowDefinition {
    const id = `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const workflow: WorkflowDefinition = {
      id,
      name,
      description,
      nodes: [],
      edges: [],
      variables: {},
      trigger: "manual",
      createdAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
    };
    this.workflows.set(id, workflow);
    return workflow;
  }

  /**
   * Add a node to a workflow.
   */
  addNode(
    workflowId: string,
    type: NodeType,
    position: [number, number],
    config?: Record<string, unknown>,
  ): WorkflowNode {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const template = NODE_TEMPLATES[type];
    const node: WorkflowNode = {
      id: `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      label: template.label,
      position,
      config: { ...template.defaultConfig, ...config },
      inputs: [...template.defaultInputs],
      outputs: [...template.defaultOutputs],
      enabled: true,
    };

    workflow.nodes.push(node);
    workflow.modifiedAt = new Date().toISOString();
    return node;
  }

  /**
   * Connect two nodes with an edge.
   */
  connectNodes(
    workflowId: string,
    sourceNodeId: string,
    sourcePort: string,
    targetNodeId: string,
    targetPort: string,
    label?: string,
  ): WorkflowEdge {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const edge: WorkflowEdge = {
      id: `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      sourceNodeId,
      sourcePort,
      targetNodeId,
      targetPort,
      label,
    };

    workflow.edges.push(edge);
    workflow.modifiedAt = new Date().toISOString();
    return edge;
  }

  /**
   * Remove a node and its connected edges.
   */
  removeNode(workflowId: string, nodeId: string): void {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return;

    workflow.nodes = workflow.nodes.filter((n) => n.id !== nodeId);
    workflow.edges = workflow.edges.filter(
      (e) => e.sourceNodeId !== nodeId && e.targetNodeId !== nodeId,
    );
    workflow.modifiedAt = new Date().toISOString();
  }

  /**
   * Validate a workflow for correctness.
   */
  validateWorkflow(workflowId: string): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return { valid: false, errors: ["Workflow not found"], warnings: [] };

    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for input nodes
    const inputNodes = workflow.nodes.filter((n) => n.type === "input");
    if (inputNodes.length === 0) {
      warnings.push("No input node found — workflow will need external data");
    }

    // Check for output nodes
    const outputNodes = workflow.nodes.filter((n) => n.type === "output");
    if (outputNodes.length === 0) {
      warnings.push("No output node found — results won't be displayed");
    }

    // Check for disconnected nodes
    for (const node of workflow.nodes) {
      const hasIncoming = workflow.edges.some((e) => e.targetNodeId === node.id);
      const hasOutgoing = workflow.edges.some((e) => e.sourceNodeId === node.id);

      if (!hasIncoming && node.type !== "input") {
        warnings.push(`Node "${node.label}" has no incoming connections`);
      }
      if (!hasOutgoing && node.type !== "output") {
        warnings.push(`Node "${node.label}" has no outgoing connections`);
      }
    }

    // Check for cycles (simple DFS)
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const hasCycle = (nodeId: string): boolean => {
      if (inStack.has(nodeId)) return true;
      if (visited.has(nodeId)) return false;
      visited.add(nodeId);
      inStack.add(nodeId);
      for (const edge of workflow.edges.filter((e) => e.sourceNodeId === nodeId)) {
        if (hasCycle(edge.targetNodeId)) return true;
      }
      inStack.delete(nodeId);
      return false;
    };

    for (const node of workflow.nodes) {
      if (hasCycle(node.id)) {
        errors.push(`Cycle detected involving node "${node.label}"`);
        break;
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Execute a workflow.
   */
  async executeWorkflow(
    workflowId: string,
    initialInput?: Record<string, unknown>,
  ): Promise<WorkflowExecution> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);

    const validation = this.validateWorkflow(workflowId);
    if (!validation.valid) {
      throw new Error(`Workflow invalid: ${validation.errors.join("; ")}`);
    }

    const execution: WorkflowExecution = {
      id: `exec-${Date.now().toString(36)}`,
      workflowId,
      status: "running",
      nodeResults: new Map(),
      currentState: { ...workflow.variables, ...initialInput },
      trace: [],
      totalTokens: 0,
      durationMs: 0,
    };

    this.executions.set(execution.id, execution);
    const startTime = Date.now();

    // Find input nodes and start execution from there
    const inputNodes = workflow.nodes.filter((n) => n.type === "input" && n.enabled);
    const queue = inputNodes.map((n) => n.id);
    const processed = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (processed.has(nodeId)) continue;
      processed.add(nodeId);

      const node = workflow.nodes.find((n) => n.id === nodeId);
      if (!node || !node.enabled) continue;

      execution.trace.push(nodeId);

      // Execute the node
      const result = await this.executeNode(node, execution.currentState);
      execution.nodeResults.set(nodeId, result);
      execution.totalTokens += result.tokensUsed;

      if (result.status === "completed") {
        // Update state with node output
        if (typeof result.output === "object" && result.output !== null) {
          Object.assign(execution.currentState, result.output);
        } else {
          execution.currentState[nodeId] = result.output;
        }

        // Enqueue downstream nodes
        const outgoing = workflow.edges.filter((e) => e.sourceNodeId === nodeId);
        for (const edge of outgoing) {
          if (!processed.has(edge.targetNodeId)) {
            queue.push(edge.targetNodeId);
          }
        }
      }
    }

    execution.status = "completed";
    execution.durationMs = Date.now() - startTime;
    return execution;
  }

  /**
   * Execute a single node.
   */
  private async executeNode(
    node: WorkflowNode,
    state: Record<string, unknown>,
  ): Promise<NodeExecutionResult> {
    const start = Date.now();

    try {
      let output: unknown;

      switch (node.type) {
        case "llm":
          output = {
            response: `[LLM: ${node.config.prompt}]`,
            model: node.config.model,
          };
          break;
        case "tool":
          output = { result: `[Tool: ${node.config.toolId}]` };
          break;
        case "condition": {
          const value = state[node.config.expression as string] ?? "";
          const conditionMet = this.evaluateCondition(value, node.config.operator as string, node.config.operand as string);
          output = { branch: conditionMet ? "true" : "false" };
          break;
        }
        case "transform":
          output = { transformed: state };
          break;
        case "code":
          output = { result: `[Code: ${node.config.language}]` };
          break;
        case "http":
          output = { status: 200, data: "[HTTP response]" };
          break;
        case "memory":
          output = { value: state[node.config.key as string] };
          break;
        case "delay":
          await new Promise((r) => setTimeout(r, Math.min(node.config.durationMs as number, 5000)));
          output = { delayed: true };
          break;
        default:
          output = state;
      }

      return {
        nodeId: node.id,
        status: "completed",
        output,
        durationMs: Date.now() - start,
        tokensUsed: node.type === "llm" ? 500 : 0,
      };
    } catch (err) {
      return {
        nodeId: node.id,
        status: "failed",
        output: null,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
        tokensUsed: 0,
      };
    }
  }

  private evaluateCondition(value: unknown, operator: string, operand: string): boolean {
    const strValue = String(value);
    switch (operator) {
      case "contains": return strValue.includes(operand);
      case "equals": return strValue === operand;
      case "gt": return Number(value) > Number(operand);
      case "lt": return Number(value) < Number(operand);
      case "not_empty": return strValue.length > 0;
      default: return Boolean(value);
    }
  }

  // ─── Management ──────────────────────────────────────────────────────

  getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  listWorkflows(): WorkflowDefinition[] {
    return [...this.workflows.values()];
  }

  deleteWorkflow(id: string): boolean {
    return this.workflows.delete(id);
  }

  getExecution(id: string): WorkflowExecution | undefined {
    return this.executions.get(id);
  }

  /**
   * Export a workflow as a JSON definition.
   */
  exportWorkflow(workflowId: string): string {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`);
    return JSON.stringify(workflow, null, 2);
  }

  /**
   * Import a workflow from JSON.
   */
  importWorkflow(json: string): WorkflowDefinition {
    const data = JSON.parse(json) as WorkflowDefinition;
    this.workflows.set(data.id, data);
    return data;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _builder: WorkflowBuilder | null = null;

export function getWorkflowBuilder(): WorkflowBuilder {
  if (!_builder) _builder = new WorkflowBuilder();
  return _builder;
}
