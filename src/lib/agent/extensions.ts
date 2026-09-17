/**
 * stitaP Extension System
 *
 * Implements AutoGen v0.4's modular and extensible architecture.
 * Provides a plugin system for custom agents, tools, memory, and models.
 *
 * Key features:
 * - Pluggable components (agents, tools, memory, models)
 * - Extension lifecycle management
 * - Community extension support
 * - Type-safe extension interfaces
 * - Extension marketplace registry
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type ExtensionType = "agent" | "tool" | "memory" | "model" | "transport" | "serializer";
export type ExtensionStatus = "registered" | "loading" | "active" | "error" | "disabled";

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  type: ExtensionType;
  dependencies?: string[];
  config?: Record<string, unknown>;
  entryPoint: string;
  tags: string[];
  repository?: string;
  homepage?: string;
}

export interface Extension<T = unknown> {
  manifest: ExtensionManifest;
  instance: T;
  status: ExtensionStatus;
  loadedAt?: string;
  error?: string;
}

export interface ExtensionFactory<T = unknown> {
  create(config?: Record<string, unknown>): Promise<T>;
  destroy?(instance: T): Promise<void>;
}

export interface ExtensionRegistryConfig {
  autoLoad: boolean;
  sandboxExtensions: boolean;
  maxExtensions: number;
  allowedTypes: ExtensionType[];
}

// ─── Extension Registry ─────────────────────────────────────────────────────

export class ExtensionRegistry {
  private extensions = new Map<string, Extension>();
  private factories = new Map<string, ExtensionFactory>();
  private config: ExtensionRegistryConfig;

  constructor(config: Partial<ExtensionRegistryConfig> = {}) {
    this.config = {
      autoLoad: true,
      sandboxExtensions: true,
      maxExtensions: 100,
      allowedTypes: ["agent", "tool", "memory", "model", "transport", "serializer"],
      ...config,
    };
  }

  /** Register an extension factory */
  registerFactory<T>(manifest: ExtensionManifest, factory: ExtensionFactory<T>): void {
    if (this.extensions.size >= this.config.maxExtensions) {
      throw new Error(`Maximum extensions (${this.config.maxExtensions}) reached`);
    }

    if (!this.config.allowedTypes.includes(manifest.type)) {
      throw new Error(`Extension type '${manifest.type}' not allowed`);
    }

    // Check dependencies
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (!this.extensions.has(dep)) {
          throw new Error(`Missing dependency: ${dep}`);
        }
      }
    }

    this.factories.set(manifest.id, factory as ExtensionFactory);
    this.extensions.set(manifest.id, {
      manifest,
      instance: null as unknown,
      status: "registered",
    });
  }

  /** Load and activate an extension */
  async load(extensionId: string): Promise<void> {
    const extension = this.extensions.get(extensionId);
    if (!extension) throw new Error(`Extension not found: ${extensionId}`);

    const factory = this.factories.get(extensionId);
    if (!factory) throw new Error(`Factory not found for: ${extensionId}`);

    extension.status = "loading";

    try {
      extension.instance = await factory.create(extension.manifest.config);
      extension.status = "active";
      extension.loadedAt = new Date().toISOString();
    } catch (error) {
      extension.status = "error";
      extension.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** Unload an extension */
  async unload(extensionId: string): Promise<void> {
    const extension = this.extensions.get(extensionId);
    if (!extension) throw new Error(`Extension not found: ${extensionId}`);

    const factory = this.factories.get(extensionId);
    if (factory?.destroy && extension.instance) {
      await factory.destroy(extension.instance);
    }

    extension.status = "disabled";
    extension.instance = null as unknown;
  }

  /** Get an active extension */
  get<T = unknown>(extensionId: string): T | null {
    const extension = this.extensions.get(extensionId);
    if (!extension || extension.status !== "active") return null;
    return extension.instance as T;
  }

  /** List all extensions */
  list(filter?: { type?: ExtensionType; status?: ExtensionStatus }): Extension[] {
    let extensions = Array.from(this.extensions.values());
    if (filter?.type) extensions = extensions.filter((e) => e.manifest.type === filter.type);
    if (filter?.status) extensions = extensions.filter((e) => e.status === filter.status);
    return extensions;
  }

  /** Get extension manifest */
  getManifest(extensionId: string): ExtensionManifest | null {
    return this.extensions.get(extensionId)?.manifest ?? null;
  }

  /** Enable/disable an extension */
  async toggle(extensionId: string, enabled: boolean): Promise<void> {
    if (enabled) {
      await this.load(extensionId);
    } else {
      await this.unload(extensionId);
    }
  }

  /** Export registry state */
  exportState(): Array<{ manifest: ExtensionManifest; status: ExtensionStatus }> {
    return Array.from(this.extensions.values()).map((e) => ({
      manifest: e.manifest,
      status: e.status,
    }));
  }
}

// ─── Built-in Extensions ────────────────────────────────────────────────────

export const BUILTIN_EXTENSIONS: ExtensionManifest[] = [
  {
    id: "stitap-agent-basic",
    name: "Basic Agent",
    version: "1.0.0",
    description: "Standard agent with tool calling and memory",
    author: "stitaP",
    license: "MIT",
    type: "agent",
    entryPoint: "builtin",
    tags: ["agent", "tools", "memory"],
  },
  {
    id: "stitap-tool-browser",
    name: "Browser Tools",
    version: "1.0.0",
    description: "Browser automation tools (navigate, click, extract, screenshot)",
    author: "stitaP",
    license: "MIT",
    type: "tool",
    entryPoint: "builtin",
    tags: ["browser", "automation", "web"],
  },
  {
    id: "stitap-tool-analytics",
    name: "Analytics Tools",
    version: "1.0.0",
    description: "SQL, XQL, MDX query engines with export to PowerBI/Excel/Tableau",
    author: "stitaP",
    license: "MIT",
    type: "tool",
    entryPoint: "builtin",
    tags: ["analytics", "sql", "data"],
  },
  {
    id: "stitap-memory-knowledge",
    name: "Knowledge Base",
    version: "1.0.0",
    description: "Document ingestion, chunking, and semantic search",
    author: "stitaP",
    license: "MIT",
    type: "memory",
    entryPoint: "builtin",
    tags: ["memory", "rag", "search"],
  },
  {
    id: "stitap-model-local",
    name: "Local Model Provider",
    version: "1.0.0",
    description: "llama.cpp and OpenVINO model serving",
    author: "stitaP",
    license: "MIT",
    type: "model",
    entryPoint: "builtin",
    tags: ["model", "local", "llama"],
  },
  {
    id: "stitap-model-cloud",
    name: "Cloud Model Provider",
    version: "1.0.0",
    description: "OpenAI, Anthropic, Google model integration",
    author: "stitaP",
    license: "MIT",
    type: "model",
    entryPoint: "builtin",
    tags: ["model", "cloud", "api"],
  },
  {
    id: "stitap-transport-websocket",
    name: "WebSocket Transport",
    version: "1.0.0",
    description: "Real-time agent communication via WebSocket",
    author: "stitaP",
    license: "MIT",
    type: "transport",
    entryPoint: "builtin",
    tags: ["transport", "websocket", "realtime"],
  },
  {
    id: "stitap-serializer-json",
    name: "JSON Serializer",
    version: "1.0.0",
    description: "JSON message serialization/deserialization",
    author: "stitaP",
    license: "MIT",
    type: "serializer",
    entryPoint: "builtin",
    tags: ["serializer", "json"],
  },
];

// ─── Community Extension Marketplace ────────────────────────────────────────

export interface CommunityExtension {
  manifest: ExtensionManifest;
  downloads: number;
  rating: number;
  reviews: number;
  verified: boolean;
  lastUpdated: string;
}

export const COMMUNITY_MARKETPLACE: CommunityExtension[] = [
  {
    manifest: {
      id: "ext-rag-advanced",
      name: "Advanced RAG",
      version: "1.2.0",
      description: "Hybrid search, reranking, and query decomposition for RAG",
      author: "community",
      license: "MIT",
      type: "memory",
      entryPoint: "community",
      tags: ["rag", "search", "reranking"],
    },
    downloads: 15000,
    rating: 4.8,
    reviews: 120,
    verified: true,
    lastUpdated: "2026-08-15",
  },
  {
    manifest: {
      id: "ext-code-executor",
      name: "Secure Code Executor",
      version: "2.0.0",
      description: "Sandboxed code execution with Docker and resource limits",
      author: "community",
      license: "Apache-2.0",
      type: "tool",
      entryPoint: "community",
      tags: ["code", "execution", "sandbox"],
    },
    downloads: 25000,
    rating: 4.9,
    reviews: 200,
    verified: true,
    lastUpdated: "2026-08-20",
  },
  {
    manifest: {
      id: "ext-multi-modal",
      name: "Multi-Modal Agent",
      version: "1.0.0",
      description: "Vision, audio, and document understanding capabilities",
      author: "community",
      license: "MIT",
      type: "agent",
      entryPoint: "community",
      tags: ["vision", "audio", "multimodal"],
    },
    downloads: 8000,
    rating: 4.5,
    reviews: 60,
    verified: true,
    lastUpdated: "2026-08-10",
  },
];
