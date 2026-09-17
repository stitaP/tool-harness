/**
 * DiagramDesign — Visual Architecture & Flow Mapping
 *
 * Converts extracted UI hierarchies, user flows, and backend integration
 * patterns into visual diagrams using Mermaid syntax.
 *
 * Supported diagram types:
 *   - User Journey Sequence Diagrams
 *   - UI Component Trees
 *   - Data Flow Diagrams
 *   - System Architecture Schemas
 *   - State Machine Diagrams
 *   - Entity-Relationship Diagrams
 *   - Route Navigation Maps
 *
 * All output is valid Mermaid syntax, renderable in any Mermaid-compatible viewer.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type DiagramType =
  | "sequence"
  | "component-tree"
  | "data-flow"
  | "architecture"
  | "state-machine"
  | "er-diagram"
  | "route-map"
  | "user-journey";

export interface DiagramNode {
  id: string;
  label: string;
  type?: string;
  metadata?: Record<string, string>;
}

export interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
  type?: "solid" | "dashed" | "dotted";
}

export interface Diagram {
  id: string;
  type: DiagramType;
  title: string;
  /** Generated Mermaid syntax */
  mermaid: string;
  /** Alternative SVG output (placeholder for rendering) */
  svg?: string;
  /** Metadata about the diagram */
  metadata: {
    nodeCount: number;
    edgeCount: number;
    generatedAt: string;
  };
}

// ─── Diagram Generator ─────────────────────────────────────────────────────

export class DiagramGenerator {
  private diagrams: Map<string, Diagram> = new Map();

  /**
   * Generate a user journey sequence diagram from route data.
   * Shows the flow a user takes through the application.
   */
  generateUserJourney(
    routes: Array<{ path: string; isProtected: boolean; interactions: string[] }>,
    title = "User Journey",
  ): Diagram {
    const id = `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lines: string[] = ["sequenceDiagram"];

    // Participants
    lines.push("    participant U as User");
    lines.push("    participant B as Browser");
    lines.push("    participant S as Server");

    let step = 0;
    for (const route of routes) {
      step++;
      const safePath = route.path.replace(/[{}]/g, "_");

      lines.push(`    Note over U,S: Step ${step}: ${safePath}`);
      lines.push(`    U->>B: Navigate to ${safePath}`);
      lines.push(`    B->>S: GET ${safePath}`);

      if (route.isProtected) {
        lines.push(`    S-->>B: 302 Redirect to /auth`);
        lines.push(`    B-->>U: Show login form`);
        lines.push(`    U->>B: Submit credentials`);
        lines.push(`    B->>S: POST /auth`);
        lines.push(`    S-->>B: 200 OK + session`);
        lines.push(`    B->>S: GET ${safePath}`);
      }

      lines.push(`    S-->>B: 200 OK (page content)`);
      lines.push(`    B-->>U: Render page`);

      for (const interaction of route.interactions) {
        lines.push(`    U->>B: ${interaction}`);
        lines.push(`    B-->>U: Update UI`);
      }
    }

    const mermaid = lines.join("\n");

    const diagram: Diagram = {
      id,
      type: "user-journey",
      title,
      mermaid,
      metadata: {
        nodeCount: 3 + step,
        edgeCount: step * 4 + routes.filter((r) => r.isProtected).length * 4,
        generatedAt: new Date().toISOString(),
      },
    };

    this.diagrams.set(id, diagram);
    return diagram;
  }

  /**
   * Generate a UI component tree diagram.
   * Shows the containment hierarchy of components.
   */
  generateComponentTree(
    components: Array<{
      name: string;
      children?: string[];
      type?: string;
    }>,
    title = "UI Component Tree",
  ): Diagram {
    const id = `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lines: string[] = ["graph TD"];

    // Sanitize node IDs for Mermaid
    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const comp of components) {
      const nodeId = sanitize(comp.name);
      const label = comp.type ? `${comp.name}\\n(${comp.type})` : comp.name;
      lines.push(`    ${nodeId}["${label}"]`);

      if (comp.children) {
        for (const child of comp.children) {
          lines.push(`    ${nodeId} --> ${sanitize(child)}`);
        }
      }
    }

    const mermaid = lines.join("\n");

    const diagram: Diagram = {
      id,
      type: "component-tree",
      title,
      mermaid,
      metadata: {
        nodeCount: components.length,
        edgeCount: components.reduce((s, c) => s + (c.children?.length ?? 0), 0),
        generatedAt: new Date().toISOString(),
      },
    };

    this.diagrams.set(id, diagram);
    return diagram;
  }

  /**
   * Generate a data flow diagram showing how data moves through the system.
   */
  generateDataFlow(
    nodes: DiagramNode[],
    edges: DiagramEdge[],
    title = "Data Flow",
  ): Diagram {
    const id = `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lines: string[] = ["graph LR"];

    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const node of nodes) {
      const nodeId = sanitize(node.id);
      const shape =
        node.type === "database"
          ? `(${node.label})`
          : node.type === "external"
            ? `>/${node.label}/]`
            : node.type === "process"
              ? `[[${node.label}]]`
              : `[${node.label}]`;
      lines.push(`    ${nodeId}${shape}`);
    }

    for (const edge of edges) {
      const fromId = sanitize(edge.from);
      const toId = sanitize(edge.to);
      const arrow =
        edge.type === "dashed"
          ? `-..->`
          : edge.type === "dotted"
            ? `-.->`
            : `-->`;
      const label = edge.label ? `|${edge.label}|` : "";
      lines.push(`    ${fromId} ${arrow}${label} ${toId}`);
    }

    const mermaid = lines.join("\n");

    const diagram: Diagram = {
      id,
      type: "data-flow",
      title,
      mermaid,
      metadata: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        generatedAt: new Date().toISOString(),
      },
    };

    this.diagrams.set(id, diagram);
    return diagram;
  }

  /**
   * Generate a system architecture diagram showing the high-level components.
   */
  generateArchitecture(
    layers: Array<{
      name: string;
      components: string[];
    }>,
    title = "System Architecture",
  ): Diagram {
    const id = `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lines: string[] = ["graph TB"];

    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");

    // Create subgraphs for each layer
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const layerId = sanitize(layer.name);
      lines.push(`    subgraph ${layerId}["${layer.name}"]`);

      for (const comp of layer.components) {
        lines.push(`        ${layerId}_${sanitize(comp)}["${comp}"]`);
      }

      lines.push("    end");

      // Connect layers sequentially
      if (i > 0) {
        const prevLayerId = sanitize(layers[i - 1].name);
        lines.push(`    ${prevLayerId} --> ${layerId}`);
      }
    }

    const mermaid = lines.join("\n");

    const diagram: Diagram = {
      id,
      type: "architecture",
      title,
      mermaid,
      metadata: {
        nodeCount: layers.reduce((s, l) => s + l.components.length, 0),
        edgeCount: Math.max(0, layers.length - 1),
        generatedAt: new Date().toISOString(),
      },
    };

    this.diagrams.set(id, diagram);
    return diagram;
  }

  /**
   * Generate a state machine diagram for interactive flows.
   */
  generateStateMachine(
    states: string[],
    transitions: Array<{ from: string; to: string; event: string }>,
    title = "State Machine",
  ): Diagram {
    const id = `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lines: string[] = ["stateDiagram-v2"];

    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const state of states) {
      lines.push(`    ${sanitize(state)}`);
    }

    for (const t of transitions) {
      lines.push(`    ${sanitize(t.from)} --> ${sanitize(t.to)} : ${t.event}`);
    }

    const mermaid = lines.join("\n");

    const diagram: Diagram = {
      id,
      type: "state-machine",
      title,
      mermaid,
      metadata: {
        nodeCount: states.length,
        edgeCount: transitions.length,
        generatedAt: new Date().toISOString(),
      },
    };

    this.diagrams.set(id, diagram);
    return diagram;
  }

  /**
   * Generate an Entity-Relationship diagram for data models.
   */
  generateERDiagram(
    entities: Array<{
      name: string;
      fields: Array<{ name: string; type: string; pk?: boolean }>;
    }>,
    relationships: Array<{
      from: string;
      to: string;
      type: "1:1" | "1:N" | "N:M";
      label?: string;
    }>,
    title = "Data Model",
  ): Diagram {
    const id = `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lines: string[] = ["erDiagram"];

    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const entity of entities) {
      lines.push(`    ${sanitize(entity.name)} {`);
      for (const field of entity.fields) {
        const pk = field.pk ? " PK" : "";
        lines.push(`        ${field.type} ${field.name}${pk}`);
      }
      lines.push("    }");
    }

    for (const rel of relationships) {
      const arrow =
        rel.type === "1:1"
          ? "||--||"
          : rel.type === "1:N"
            ? "||--|{"
            : "}|--|{";
      const label = rel.label ? `: ${rel.label}` : "";
      lines.push(`    ${sanitize(rel.from)} ${arrow} ${sanitize(rel.to)} ${label}`);
    }

    const mermaid = lines.join("\n");

    const diagram: Diagram = {
      id,
      type: "er-diagram",
      title,
      mermaid,
      metadata: {
        nodeCount: entities.length,
        edgeCount: relationships.length,
        generatedAt: new Date().toISOString(),
      },
    };

    this.diagrams.set(id, diagram);
    return diagram;
  }

  /**
   * Generate a route navigation map showing all routes and their relationships.
   */
  generateRouteMap(
    routes: Array<{
      path: string;
      children?: string[];
      isProtected?: boolean;
    }>,
    title = "Route Navigation Map",
  ): Diagram {
    const id = `diagram-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const lines: string[] = ["graph TD"];

    const sanitize = (path: string) => path.replace(/[^a-zA-Z0-9_]/g, "_");

    for (const route of routes) {
      const nodeId = sanitize(route.path);
      const style = route.isProtected ? ":::protected" : "";
      lines.push(`    ${nodeId}["${route.path}"]${style}`);

      if (route.children) {
        for (const child of route.children) {
          lines.push(`    ${nodeId} --> ${sanitize(child)}`);
        }
      }
    }

    lines.push("");
    lines.push("    classDef protected fill:#fee2e2,stroke:#dc2626,color:#991b1b");
    lines.push("    classDef public fill:#dcfce7,stroke:#16a34a,color:#166534");

    const mermaid = lines.join("\n");

    const diagram: Diagram = {
      id,
      type: "route-map",
      title,
      mermaid,
      metadata: {
        nodeCount: routes.length,
        edgeCount: routes.reduce((s, r) => s + (r.children?.length ?? 0), 0),
        generatedAt: new Date().toISOString(),
      },
    };

    this.diagrams.set(id, diagram);
    return diagram;
  }

  // ─── Management ──────────────────────────────────────────────────────

  getDiagram(id: string): Diagram | undefined {
    return this.diagrams.get(id);
  }

  listDiagrams(): Diagram[] {
    return [...this.diagrams.values()];
  }

  listDiagramsByType(type: DiagramType): Diagram[] {
    return [...this.diagrams.values()].filter((d) => d.type === type);
  }

  deleteDiagram(id: string): boolean {
    return this.diagrams.delete(id);
  }

  /**
   * Render all diagrams as a combined Mermaid document.
   */
  renderAll(): string {
    const diagrams = [...this.diagrams.values()];
    return diagrams
      .map((d) => `%% ${d.title}\n%% Type: ${d.type} | Nodes: ${d.metadata.nodeCount} | Edges: ${d.metadata.edgeCount}\n${d.mermaid}`)
      .join("\n\n---\n\n");
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _generator: DiagramGenerator | null = null;

export function getDiagramGenerator(): DiagramGenerator {
  if (!_generator) {
    _generator = new DiagramGenerator();
  }
  return _generator;
}
