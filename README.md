# Nano-Gateway 🚀

A high-performance, resilient, and extensible LLM API Gateway built from scratch in Go.

Designed specifically for **high-concurrency production workloads**, featuring strict decoupling between the **Data Plane (极致并发代理面)** and the **Control Plane (运维与管理控制面)** with an **embedded modern Web UI (单二进制内嵌运维大盘)**.

---

## 🌟 Key Architectural Highlights

### 1. Data Plane & Control Plane Strict Decoupling (控制面与数据面解耦)
- **Zero-DB on Hot Path (热路径零数据库查询)**:
  - Channels, virtual keys, and routing tables are persisted in SQLite / PostgreSQL by the Control Plane.
  - When changes occur, the Control Plane pushes state to the Data Plane via **atomic in-memory pointers** (`atomic.Pointer` / RCU).
  - All streaming and completion requests execute purely against high-speed in-memory hash tables ($O(1)$ lookup, $< 5\mu s$).
- **Safe Fallback Window (首字前无感容灾)**:
  - If the primary channel returns HTTP 429, 500, network connect error, or timeout **before the first token is generated**, the gateway automatically fails over to the next priority channel in the fallback chain.
- **Embedded Web UI (`//go:embed`)**:
  - Full-featured, responsive SPA embedded directly into the single compiled binary!
  - No Nginx or Node.js required in production. Just run `./nano-gateway` to get both the high-performance proxy and the web console.
- **Multi-Provider Protocol Adaptation**:
  - **OpenAI Compatible**: Direct high-speed proxying for OpenAI, DeepSeek, vLLM, SGLang, Ollama, Groq, etc.
  - **Anthropic Claude Adapter**: Full bidirectional translation of OpenAI format to Anthropic `/v1/messages`, including streaming SSE translation (`content_block_delta` -> `chat.completion.chunk`) and usage reporting.
- **Tenant Governance & Token Bucket Rate Limiting**:
  - Virtual API keys (`sk-gw-xxxx`) with RPM limits and model whitelisting.
- **Prometheus Metrics & TTFT Tracking**:
  - Real-time **TTFT (Time To First Token)** measurement.
  - `/metrics` endpoint exporting Prometheus counters, latencies, and token usage.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│             Embedded Web UI Console (/ui/)             │
│   Dashboard 大盘 · 渠道管理 · 虚拟 Key 治理 · 在线调试台    │
└───────────────────────────┬────────────────────────────┘
                            │ RESTful Admin API (/api/v1/admin/*)
                            ▼
┌────────────────────────────────────────────────────────┐
│          Control Plane (控制面 - 运维管理与存储)         │
│   - SQLite (内置嵌入式存储) / PostgreSQL               │
│   - Channels & Keys CRUD                               │
│   - In-Memory Hot-Reload Synchronizer                  │
└───────────────────────────┬────────────────────────────┘
                            │ Atomic Memory Reload (Zero-DB on proxy)
                            ▼
┌────────────────────────────────────────────────────────┐
│       Data Plane (数据面 - 极致高并发 SSE 流式代理)      │
│   - OpenAI Ingress (/v1/chat/completions, /v1/models)  │
│   - Token Bucket Rate Limiter (RPM)                    │
│   - Priority & Weighted Routing Engine                 │
│   - Safe Fallback Window (Pre-first-token retry)       │
│   - Providers: OpenAI / DeepSeek / vLLM / Claude       │
└────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Requirements
- Go 1.22+ (tested with Go 1.26.1)

### 2. Build & Run
```bash
# 1. Build single binary (contains embedded Web UI)
make build

# 2. Run gateway
./bin/nano-gateway -config configs/config.yaml -db data/gateway.db
```

### 3. Access Web Console
Open your browser and navigate to:
👉 **`http://localhost:8080/ui/`**

Features available in Web UI:
- **Dashboard**: Real-time QPS, active connections, total tokens, average TTFT.
- **Channels**: Add upstream providers, configure priority & model mappings, and test live connectivity with the **"连通性测试"** button.
- **Virtual Keys**: Generate `sk-gw-xxxx` keys, set RPM rate limits, and restrict allowed models.
- **Playground**: Test any model with non-streaming or SSE streaming generation.

---

## 📡 API Usage Examples

### 1. Non-Streaming Chat Completion
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-gw-admin-demo" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "user", "content": "Explain quantum computing in one sentence."}
    ],
    "temperature": 0.7
  }'
```

### 2. Streaming Chat Completion (SSE)
```bash
curl -N -X POST http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-gw-admin-demo" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "user", "content": "Write a 4-line poem about high concurrency."}
    ],
    "stream": true
  }'
```

### 3. Admin REST API
```bash
# List all channels
curl http://localhost:8080/api/v1/admin/channels

# Create new channel
curl -X POST http://localhost:8080/api/v1/admin/channels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-deepseek",
    "type": "openai",
    "base_url": "https://api.deepseek.com/v1",
    "api_key": "sk-xxx",
    "models": ["deepseek-chat"],
    "priority": 1
  }'

# Create new virtual key
curl -X POST http://localhost:8080/api/v1/admin/keys \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "agent-team",
    "rpm": 120
  }'
```

---

## 🧪 Testing

Run comprehensive unit, race detection, and mock fallback tests:
```bash
make test
```
