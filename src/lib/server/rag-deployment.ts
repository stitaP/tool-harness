/**
 * stitaP RAG Server Deployment Kit
 *
 * Complete deployment guide for turning pre-2008 servers into functional
 * RAG chatbot servers. Covers:
 *
 * 1. Hardware preparation and power/cooling considerations
 * 2. OS installation (lightweight Linux for old hardware)
 * 3. llama.cpp build and model selection
 * 4. Vector database setup (ChromaDB / FAISS for old hardware)
 * 5. Document ingestion pipeline
 * 6. API gateway and reverse proxy
 * 7. Monitoring and health checks
 * 8. Network security for internal deployment
 *
 * Target use case: Internal help-desk, documentation search, ticket triage,
 * knowledge base Q&A — where response latency of 1-5 seconds is acceptable.
 */

import type { ServerModel } from "./legacy-hardware";
import type { HardwareProfile } from "./hardware-detect";
import type { BuildPlan, BuildConfig, ModelRecommendation } from "./llama-build-optimizer";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DeploymentPlan {
  /** Server being deployed on */
  server: string;
  /** Operating system recommendation */
  os: OSRecommendation;
  /** llama.cpp build plan */
  buildPlan: BuildPlan;
  /** Vector database recommendation */
  vectorDB: VectorDBRecommendation;
  /** Document ingestion pipeline */
  ingestion: IngestionConfig;
  /** Network and security config */
  network: NetworkConfig;
  /** Monitoring setup */
  monitoring: MonitoringConfig;
  /** Full step-by-step deployment script */
  deploymentScript: string;
  /** Performance expectations */
  expectations: PerformanceExpectations;
}

export interface OSRecommendation {
  name: string;
  version: string;
  url: string;
  minRAMMB: number;
  downloadSizeMB: number;
  /** Why this OS for old hardware */
  rationale: string;
  /** Install command */
  installNotes: string;
}

export interface VectorDBRecommendation {
  name: string;
  type: "in-process" | "server" | "embedded";
  language: "python" | "rust" | "node";
  ramOverheadMB: number;
  /** Whether it runs on the target build */
  compatible: boolean;
  installCommand: string;
  rationale: string;
}

export interface IngestionConfig {
  /** Supported document formats */
  formats: string[];
  /** Chunk size in tokens */
  chunkSize: number;
  /** Chunk overlap in tokens */
  chunkOverlap: number;
  /** Embedding model (local or API) */
  embeddingSource: "local" | "api";
  /** Embedding model name */
  embeddingModel: string;
  /** Embedding dimensions */
  embeddingDims: number;
  /** Max documents per ingestion batch */
  batchSize: number;
}

export interface NetworkConfig {
  /** Ports to expose */
  ports: { port: number; service: string; internal: boolean }[];
  /** Firewall rules */
  firewall: string[];
  /** Reverse proxy config */
  reverseProxy: string;
  /** TLS/SSL */
  tls: boolean;
  /** Authentication method */
  auth: "none" | "api-key" | "basic" | "oauth";
}

export interface MonitoringConfig {
  /** Metrics to track */
  metrics: string[];
  /** Log rotation */
  logRotation: string;
  /** Health check endpoint */
  healthCheck: string;
  /** Alert conditions */
  alerts: string[];
}

export interface PerformanceExpectations {
  /** Cold start time (first query) */
  coldStartSec: number;
  /** Warm query latency (single question) */
  warmQueryLatencyMs: number;
  /** Embedding latency per document */
  embeddingLatencyMs: number;
  /** Max concurrent users */
  maxConcurrentUsers: number;
  /** Max documents in knowledge base */
  maxDocuments: number;
  /** Tokens per second (inference) */
  tokensPerSecond: number;
  /** Throughput (queries per minute) */
  queriesPerMinute: number;
  /** Notes on real-world performance */
  notes: string[];
}

// ─── OS Recommendations ─────────────────────────────────────────────────────

const OS_OPTIONS: OSRecommendation[] = [
  {
    name: "Debian 11 (Bullseye)",
    version: "11.x",
    url: "https://www.debian.org/releases/bullseye/",
    minRAMMB: 256,
    downloadSizeMB: 300,
    rationale:
      "Stable, minimal, huge package repository. Runs on anything from Pentium II onwards. Long-term support until 2026. Best balance of compatibility and maintenance for old hardware.",
    installNotes: "Use the netinst ISO (300 MB). During install, deselect all desktop environments. Select only 'SSH server' and 'standard system utilities'.",
  },
  {
    name: "Alpine Linux",
    version: "3.x",
    url: "https://alpinelinux.org/",
    minRAMMB: 64,
    downloadSizeMB: 50,
    rationale:
      "Tiny footprint (64 MB min RAM, 50 MB download). musl libc is smaller than glibc. Uses OpenRC instead of systemd. Ideal for the most constrained pre-2008 hardware with under 2 GB RAM.",
    installNotes: "Use the virtual or standard ISO. Select 'sys' mode for dedicated servers. After install: 'apk update && apk add build-base cmake git'.",
  },
  {
    name: "Ubuntu Server 22.04 LTS",
    version: "22.04.x",
    url: "https://ubuntu.com/download/server",
    minRAMMB: 512,
    downloadSizeMB: 800,
    rationale:
      "Largest community, easiest package management. Support until 2027. Requires slightly more RAM than Debian but offers newer GCC (important for some llama.cpp features).",
    installNotes: "Use the minimal install image. During install, only select 'OpenSSH server'. No GUI packages.",
  },
  {
    name: "CentOS Stream 9 / Rocky Linux 9",
    version: "9.x",
    url: "https://rockylinux.org/",
    minRAMMB: 512,
    downloadSizeMB: 900,
    rationale:
      "Enterprise-grade, SELinux included. Common in corporate data centres where the old servers already live. Familiar to enterprise admins.",
    installNotes: "Use the 'Minimal Install' profile. After install: 'dnf groupinstall \"Development Tools\" && dnf install cmake git'.",
  },
];

// ─── Vector Database Recommendations ────────────────────────────────────────

function getVectorDBRecommendation(ramGB: number): VectorDBRecommendation {
  if (ramGB <= 4) {
    return {
      name: "SQLite + sqlite-vss",
      type: "embedded",
      language: "python",
      ramOverheadMB: 32,
      compatible: true,
      installCommand: "pip install sqlite-vss",
      rationale:
        "Minimal RAM overhead. Runs as a SQLite extension. Good for up to 10K documents. No separate server process. Perfect for 4 GB machines.",
    };
  }
  if (ramGB <= 8) {
    return {
      name: "ChromaDB",
      type: "embedded",
      language: "python",
      ramOverheadMB: 128,
      compatible: true,
      installCommand: "pip install chromadb",
      rationale:
        "Embedded mode uses SQLite + hnswlib. Low overhead, auto-persists to disk. Supports up to 100K documents. API is simple and well-documented.",
    };
  }
  if (ramGB <= 16) {
    return {
      name: "ChromaDB (server mode)",
      type: "server",
      language: "python",
      ramOverheadMB: 256,
      compatible: true,
      installCommand: "pip install chromadb && chroma run --host 0.0.0.0 --port 8000",
      rationale:
        "Server mode allows multiple clients. Handles up to 500K documents. Good for team use on a shared server.",
    };
  }
  return {
    name: "ChromaDB + FAISS",
    type: "server",
    language: "python",
    ramOverheadMB: 512,
    compatible: true,
    installCommand: "pip install chromadb faiss-cpu",
    rationale:
      "FAISS with IVF index for faster search over 1M+ documents. ChromaDB for the API layer. Requires 16+ GB for large corpora.",
  };
}

// ─── Performance Estimator ──────────────────────────────────────────────────

function estimatePerformance(
  buildConfig: BuildConfig,
  _models: ModelRecommendation[],
  totalRAMGB: number,
  vectorDB: VectorDBRecommendation,
): PerformanceExpectations {
  const tps = buildConfig.estimatedTPS;
  const queryTokens = 200; // Average answer length
  const embeddingTokens = 50; // Average query length for embedding

  // Cold start: model load time depends on file size and disk speed
  const modelSizeGB = totalRAMGB <= 4 ? 0.35 : totalRAMGB <= 8 ? 0.95 : 2.0;
  const coldStartSec = Math.ceil(modelSizeGB * 5); // Rough: 5 sec per GB from HDD

  return {
    coldStartSec,
    warmQueryLatencyMs: Math.ceil((queryTokens / tps) * 1000),
    embeddingLatencyMs: 50, // Local embedding is fast
    maxConcurrentUsers: Math.max(1, Math.floor(totalRAMGB / 4)),
    maxDocuments: totalRAMGB <= 4 ? 10000 : totalRAMGB <= 8 ? 100000 : 500000,
    tokensPerSecond: tps,
    queriesPerMinute: Math.floor(60 / ((queryTokens / tps) + 0.1)),
    notes: [
      `Cold start (~${coldStartSec}s) is expected from HDD. Use SSD if available.`,
      `First query is slower due to KV cache warmup.`,
      `Concurrent users limited by RAM — each user needs ~${Math.ceil(totalRAMGB / Math.max(1, Math.floor(totalRAMGB / 4)))} GB for context.`,
      `Vector DB overhead: ${vectorDB.ramOverheadMB} MB.`,
      `For production, put nginx in front for connection pooling.`,
    ],
  };
}

// ─── Deployment Script Generator ────────────────────────────────────────────

function generateDeploymentScript(
  plan: DeploymentPlan,
): string {
  const { os, buildPlan, vectorDB, ingestion, network } = plan;
  const build = buildPlan.buildConfig;
  const model = buildPlan.models[0];

  return `#!/bin/bash
# ================================================================
# stitaP RAG Server Deployment Script
# Target: ${plan.server}
# Generated: ${new Date().toISOString()}
# ================================================================
set -euo pipefail

echo "=== stitaP RAG Server Deployment ==="
echo "Server: ${plan.server}"
echo "OS: ${os.name} ${os.version}"
echo "Build target: ${buildPlan.buildTarget.toUpperCase()}"
echo ""

# ── Phase 1: System Preparation ──────────────────────────────
echo "[1/6] System preparation..."

# Update system
sudo apt-get update -qq
sudo apt-get install -y -qq build-essential cmake git wget curl python3 python3-pip python3-venv nginx

# Set timezone
sudo timedatectl set-timezone UTC

# Configure swap (critical for old servers with limited RAM)
if [ ! -f /swapfile ]; then
  sudo fallocate -l 4G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo "Swap configured: 4 GB"
fi

# Optimize kernel for llama.cpp
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
echo 'vm.overcommit_memory=1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p

# ── Phase 2: Build llama.cpp ────────────────────────────────
echo "[2/6] Building llama.cpp (${buildPlan.buildTarget.toUpperCase()} target)..."

cd /opt
${build.buildCommands.join("\n")}

echo "Build complete: /opt/llama.cpp/build/bin/llama-server"

# ── Phase 3: Download Model ─────────────────────────────────
echo "[3/6] Downloading model..."

mkdir -p /opt/rag/models
cd /opt/rag/models
${model ? `# Download ${model.name} (${model.quant}, ${model.fileSizeGB} GB)
wget -c "https://huggingface.co/${model.downloadPattern}" -O ${model.name}.gguf` : "# No model fits this hardware"}

# ── Phase 4: Vector Database ────────────────────────────────
echo "[4/6] Setting up vector database (${vectorDB.name})..."

python3 -m venv /opt/rag/venv
source /opt/rag/venv/bin/activate
pip install --quiet ${vectorDB.installCommand.replace("pip install ", "")}
pip install --quiet fastapi uvicorn python-multipart

# ── Phase 5: RAG Server Application ────────────────────────
echo "[5/6] Creating RAG server application..."

cat > /opt/rag/server.py << 'RAG_EOF'
"""
stitaP RAG Server
Bridges llama.cpp (inference + embeddings) with ChromaDB (vector storage).
"""
import os
import json
import subprocess
import chromadb
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import httpx
import uvicorn

app = FastAPI(title="stitaP RAG Server")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

LLAMA_URL = "http://127.0.0.1:8080"
CHROMA = chromadb.Client()
COLLECTION = CHROMA.get_or_create_collection(
    name="documents",
    metadata={"hnsw:space": "cosine"}
)

class QueryRequest(BaseModel):
    query: str
    top_k: int = 5
    max_tokens: int = 500

class IngestRequest(BaseModel):
    documents: List[dict]  # [{text: str, metadata: dict}]

@app.get("/health")
async def health():
    try:
        async with httpx.AsyncClient() as client:
            r = await client.get(f"{LLAMA_URL}/health")
            llama_ok = r.status_code == 200
    except:
        llama_ok = False
    return {
        "status": "ok" if llama_ok else "degraded",
        "llama_server": llama_ok,
        "documents": COLLECTION.count(),
    }

@app.post("/v1/rag/query")
async def rag_query(req: QueryRequest):
    # 1. Get embeddings for the query
    async with httpx.AsyncClient() as client:
        emb_resp = await client.post(f"{LLAMA_URL}/v1/embeddings", json={
            "input": req.query,
            "model": "embedding"
        })
        query_embedding = emb_resp.json()["data"][0]["embedding"]

    # 2. Search vector DB
    results = COLLECTION.query(
        query_embeddings=[query_embedding],
        n_results=req.top_k,
        include=["documents", "metadatas", "distances"]
    )

    # 3. Build context from retrieved documents
    context_parts = []
    for i, doc in enumerate(results["documents"][0]):
        meta = results["metadatas"][0][i] if results["metadatas"] else {}
        context_parts.append(f"[Document {i+1}] {doc}")
    context = "\\n\\n".join(context_parts)

    # 4. Generate answer with context
    messages = [
        {"role": "system", "content": f"Answer based on the following context:\\n\\n{context}"},
        {"role": "user", "content": req.query}
    ]
    async with httpx.AsyncClient() as client:
        chat_resp = await client.post(f"{LLAMA_URL}/v1/chat/completions", json={
            "model": "rag",
            "messages": messages,
            "max_tokens": req.max_tokens,
        })
        answer = chat_resp.json()["choices"][0]["message"]["content"]

    return {
        "answer": answer,
        "sources": [
            {"text": results["documents"][0][i][:200], "score": 1 - results["distances"][0][i]}
            for i in range(len(results["documents"][0]))
        ]
    }

@app.post("/v1/rag/ingest")
async def rag_ingest(req: IngestRequest):
    ids = [f"doc_{i}" for i in range(COLLECTION.count(), COLLECTION.count() + len(req.documents))]
    texts = [d["text"] for d in req.documents]
    metadatas = [d.get("metadata", {}) for d in req.documents]

    # Get embeddings
    async with httpx.AsyncClient() as client:
        emb_resp = await client.post(f"{LLAMA_URL}/v1/embeddings", json={
            "input": texts,
            "model": "embedding"
        })
        embeddings = [d["embedding"] for d in emb_resp.json()["data"]]

    COLLECTION.add(ids=ids, documents=texts, metadatas=metadatas, embeddings=embeddings)
    return {"ingested": len(req.documents), "total": COLLECTION.count()}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
RAG_EOF

# ── Phase 6: Service Configuration ─────────────────────────
echo "[6/6] Configuring services..."

# Create systemd service for llama.cpp
cat > /etc/systemd/system/llama-server.service << EOF
[Unit]
Description=llama.cpp Server
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/llama.cpp
ExecStart=/opt/llama.cpp/build/bin/llama-server \\
  -m /opt/rag/models/*.gguf \\
  --host 127.0.0.1 \\
  --port 8080 \\
  -t ${build.threadCount} \\
  -c ${build.contextLength} \\
  -b ${build.batchSize} \\
  ${build.mlock ? "--mlock \\" : ""}
  --parallel 2 \\
  --embedding
Restart=on-failure
RestartSec=10
MemoryMax=4G

[Install]
WantedBy=multi-user.target
EOF

# Create systemd service for RAG server
cat > /etc/systemd/system/rag-server.service << EOF
[Unit]
Description=stitaP RAG Server
After=llama-server.service
Requires=llama-server.service

[Service]
Type=simple
WorkingDirectory=/opt/rag
ExecStart=/opt/rag/venv/bin/python /opt/rag/server.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Nginx reverse proxy
cat > /etc/nginx/sites-available/rag << EOF
server {
    listen 80;
    server_name _;

    # RAG API
    location /api/ {
        proxy_pass http://127.0.0.1:9000/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 120s;
    }

    # Direct llama.cpp access (for embedding calls)
    location /llama/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host \$host;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:9000/health;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/rag /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl reload nginx

# Start services
sudo systemctl daemon-reload
sudo systemctl enable llama-server rag-server
sudo systemctl start llama-server
sleep 10  # Wait for model to load
sudo systemctl start rag-server

echo ""
echo "=== Deployment Complete ==="
echo "RAG API: http://SERVER_IP/api/v1/rag/query"
echo "Health:  http://SERVER_IP/health"
echo ""
echo "Test with:"
echo '  curl -X POST http://localhost/api/v1/rag/query \\'
echo '    -H "Content-Type: application/json" \\'
echo '    -d \'{"query": "What is our vacation policy?"}\''
echo ""
echo "Ingest documents:"
echo '  curl -X POST http://localhost/api/v1/rag/ingest \\'
echo '    -H "Content-Type: application/json" \\'
echo '    -d \'{"documents": [{"text": "...", "metadata": {"source": "handbook.pdf"}}]}\''
`;
}

// ─── Main Export ────────────────────────────────────────────────────────────

/** Generate a complete deployment plan for a server */
export function generateDeploymentPlan(
  server: ServerModel | HardwareProfile,
  buildPlan: BuildPlan,
): DeploymentPlan {
  const serverName = "name" in server
    ? `${server.manufacturer} ${server.name}`
    : server.hostname || "Detected Server";
  const totalRAMGB = "maxRAMGB" in server ? server.maxRAMGB : server.memory.totalGB;

  const os = totalRAMGB <= 2 ? OS_OPTIONS[1] : totalRAMGB <= 4 ? OS_OPTIONS[0] : OS_OPTIONS[2];
  const vectorDB = getVectorDBRecommendation(totalRAMGB);
  const build = buildPlan.buildConfig;

  const ingestion: IngestionConfig = {
    formats: ["pdf", "txt", "md", "html", "json", "csv"],
    chunkSize: 512,
    chunkOverlap: 64,
    embeddingSource: "local",
    embeddingModel: "llama.cpp built-in embedding endpoint",
    embeddingDims: 384,
    batchSize: totalRAMGB <= 4 ? 10 : 50,
  };

  const network: NetworkConfig = {
    ports: [
      { port: 80, service: "Nginx reverse proxy", internal: false },
      { port: 8080, service: "llama.cpp server", internal: true },
      { port: 9000, service: "RAG API server", internal: true },
      { port: 8000, service: "Vector DB (if server mode)", internal: true },
    ],
    firewall: [
      "ufw allow 80/tcp    # HTTP (reverse proxy)",
      "ufw allow 22/tcp    # SSH",
      "ufw deny 8080/tcp   # llama.cpp (internal only)",
      "ufw deny 9000/tcp   # RAG server (via nginx only)",
    ],
    reverseProxy: "nginx",
    tls: false, // Internal network — TLS recommended but not required
    auth: "api-key",
  };

  const monitoring: MonitoringConfig = {
    metrics: ["tokens_per_second", "query_latency", "memory_usage", "model_load_time"],
    logRotation: "rotate /var/log/rag/*.log daily, keep 7 days",
    healthCheck: "GET /health every 30 seconds",
    alerts: [
      "Memory usage > 90%",
      "Query latency > 10s",
      "llama-server process down",
      "Disk usage > 85%",
    ],
  };

  const deploymentScript = generateDeploymentScript({
    server: serverName,
    os,
    buildPlan,
    vectorDB,
    ingestion,
    network,
    monitoring,
    deploymentScript: "", // Will be filled by the recursive call
    expectations: { coldStartSec: 0, warmQueryLatencyMs: 0, embeddingLatencyMs: 0, maxConcurrentUsers: 0, maxDocuments: 0, tokensPerSecond: 0, queriesPerMinute: 0, notes: [] },
  });

  const expectations = estimatePerformance(build, buildPlan.models, totalRAMGB, vectorDB);

  return {
    server: serverName,
    os,
    buildPlan,
    vectorDB,
    ingestion,
    network,
    monitoring,
    deploymentScript,
    expectations,
  };
}

/** Get the summary of what this deployment achieves */
export function getDeploymentSummary(plan: DeploymentPlan): {
  title: string;
  description: string;
  capabilities: string[];
  limitations: string[];
  costComparison: { newServer: string; repurposedServer: string; savings: string };
} {
  return {
    title: `RAG Chatbot Server: ${plan.server}`,
    description: `Repurposes a pre-2008 server into a functional RAG chatbot server capable of answering internal questions from uploaded documentation.`,
    capabilities: [
      "Document ingestion (PDF, text, markdown, HTML)",
      "Semantic search over uploaded documents",
      "Natural language question answering",
      "OpenAI-compatible API endpoints",
      "Internal help-desk automation",
      "Documentation search and Q&A",
      "Ticket triage assistance",
      `Up to ${plan.expectations.maxDocuments.toLocaleString()} documents in the knowledge base`,
      `${plan.expectations.tokensPerSecond} tokens/second inference speed`,
      `${plan.expectations.maxConcurrentUsers} concurrent users`,
    ],
    limitations: [
      `Cold start takes ~${plan.expectations.coldStartSec}s (model loading from disk)`,
      `Response latency ~${plan.expectations.warmQueryLatencyMs}ms for warm queries`,
      "No real-time streaming (use for batch/internal queries)",
      "Models limited to 0.5B-3B parameters (depending on RAM)",
      "No GPU acceleration (CPU-only inference)",
      "Knowledge base limited by available RAM",
    ],
    costComparison: {
      newServer: "$3,000-$15,000 for a new server with GPU",
      repurposedServer: "$0 (already owned) + $0 (electricity if already in data centre)",
      savings: "100% hardware cost savings + reduced e-waste",
    },
  };
}
