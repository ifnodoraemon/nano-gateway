# Nano-Gateway API Reference Specification

Nano-Gateway provides high-performance, unified API endpoints conforming to OpenAI standard specifications, Anthropic Claude native specifications, and multimodal generation interfaces.

---

## 1. Authentication & Rate Limiting

Client requests to Data Plane endpoints under `/v1` require virtual key authentication via standard HTTP headers:
- `Authorization: Bearer sk-gw-xxxx`
- Or `x-api-key: sk-gw-xxxx`

If no virtual keys are configured, the gateway operates in open bypass mode (no authentication required).

---

## 2. Text & Chat Endpoints

### 2.1 Chat Completions
- **Endpoint**: `POST /v1/chat/completions`
- **Supported Providers**: All (OpenAI, DeepSeek, vLLM, SGLang, GPUStack, Sub2API, Anthropic Claude, Google Gemini).
- **Protocol Adaptation**: If downstream only supports text completion (`/v1/completions`), Nano-Gateway automatically formats messages into a prompt and translates the response back.

#### Request Example:
```bash
curl -X POST http://localhost:8080/v1/chat/completions \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "system", "content": "You are a helpful coding assistant."},
      {"role": "user", "content": "Write a quicksort in Go."}
    ],
    "stream": true,
    "temperature": 0.7
  }'
```

### 2.2 Legacy Text Completions
- **Endpoint**: `POST /v1/completions`
- **Supported Providers**: All. If downstream only supports chat completions, the request is automatically wrapped into a user chat message.

#### Request Example:
```bash
curl -X POST http://localhost:8080/v1/completions \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-davinci-003",
    "prompt": "Translate the following English text to French: Hello world",
    "max_tokens": 128
  }'
```

### 2.3 Anthropic Claude Messages API
- **Endpoint**: `POST /v1/messages`
- **Supported Clients**: Native Anthropic Python/TypeScript SDK, Claude Code, Cursor, Cline.
- **Full-Duplex Translation**: Clients using Anthropic format can query upstream OpenAI or GPUStack clusters; request and SSE stream responses are bidirectionally converted with zero latency.

#### Request Example:
```bash
curl -X POST http://localhost:8080/v1/messages \
  -H "x-api-key: sk-gw-xxxx" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Explain quantum computing briefly."}
    ]
  }'
```

---

## 3. Multimodal Endpoints

### 3.1 AI Image Generation
- **Endpoint**: `POST /v1/images/generations`
- **Models**: `dall-e-3`, `flux-schnell`, `stable-diffusion-3`, etc.

#### Request Example:
```bash
curl -X POST http://localhost:8080/v1/images/generations \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dall-e-3",
    "prompt": "A modern datacenter server room with green neon lighting, 8k digital art",
    "size": "1024x1024",
    "quality": "standard",
    "n": 1
  }'
```

### 3.2 Text-to-Speech (TTS)
- **Endpoint**: `POST /v1/audio/speech`
- **Response**: Binary audio stream (`audio/mpeg`), streamed directly to client without buffering in memory.

#### Request Example:
```bash
curl -X POST http://localhost:8080/v1/audio/speech \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "欢迎体验 Nano-Gateway 极致性能企业级多模态网关系统。",
    "voice": "alloy",
    "response_format": "mp3"
  }' --output output.mp3
```

### 3.3 Audio Transcription (Whisper STT)
- **Endpoint**: `POST /v1/audio/transcriptions`
- **Content-Type**: `multipart/form-data`

#### Request Example:
```bash
curl -X POST http://localhost:8080/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -F "file=@/path/to/audio.mp3" \
  -F "model=whisper-1"
```

### 3.4 Video Generation & Task Polling
- **Task Submission**: `POST /v1/videos/generations`
- **Task Polling**: `GET /v1/videos/tasks/:id`

#### Request Example:
```bash
# 1. Submit task
curl -X POST http://localhost:8080/v1/videos/generations \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sora",
    "prompt": "A drone shot flying over a futuristic city at sunset",
    "aspect_ratio": "16:9"
  }'

# Returns: {"task_id": "video_task_123", "status": "PENDING"}

# 2. Poll task status
curl -X GET http://localhost:8080/v1/videos/tasks/video_task_123 \
  -H "Authorization: Bearer sk-gw-xxxx"
```

### 3.5 Vector Embeddings
- **Endpoint**: `POST /v1/embeddings`
- **Supported Providers**: OpenAI, GPUStack, vLLM, Ollama, SGLang, Sub2API, Google Gemini.
- **Protocol Adaptation**: Full native translation for Google Gemini (`:embedContent` and `:batchEmbedContents`), model rewriting, token tracking, and automatic safe fallback across candidate embedding nodes. Supports single string or batch string inputs.

#### Request Example:
```bash
curl -X POST http://localhost:8080/v1/embeddings \
  -H "Authorization: Bearer sk-gw-xxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "text-embedding-3-small",
    "input": ["Deep learning infrastructure", "Next-generation agentic AI gateway"]
  }'
```

#### Response Example:
```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.0023, -0.015, 0.045, 0.088]
    },
    {
      "object": "embedding",
      "index": 1,
      "embedding": [-0.034, 0.082, 0.011, -0.005]
    }
  ],
  "model": "text-embedding-3-small",
  "usage": {
    "prompt_tokens": 12,
    "total_tokens": 12
  }
}
```

---

## 4. Control Plane Admin APIs

All Admin APIs are under `/api/v1/admin`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/v1/admin/channels` | List all configured providers with live circuit breaker statuses |
| `POST` | `/api/v1/admin/channels` | Create a new provider and immediately hot-reload in memory |
| `POST` | `/api/v1/admin/channels/probe` | **Auto-Probe**: Automatically test downstream URL, extract model IDs, infer protocols |
| `POST` | `/api/v1/admin/channels/:id/test` | Ping downstream provider for latency & response verification |
| `DELETE`| `/api/v1/admin/channels/:id` | Delete provider and remove from routing |
| `GET` | `/api/v1/admin/keys` | List all client virtual keys with rate limits & budgets |
| `POST` | `/api/v1/admin/keys` | Create client virtual key |
| `DELETE`| `/api/v1/admin/keys/:id` | Revoke client virtual key |
| `GET` | `/api/v1/admin/logs?limit=50` | Query real-time audit logs with TTFT, tokens, latency, status code |
| `GET` | `/api/v1/admin/stats/overview` | Query aggregated gateway statistics (QPS, TTFT, Tokens) |
| `GET` | `/api/v1/admin/models` | List all active models across providers |

---

## 5. Observability Endpoints

- **Health Check**: `GET /health` (`{"status": "healthy"}`)
- **Prometheus Metrics**: `GET /metrics` (Standard Prometheus exposition format)
- **Web Console**: `GET /ui/` (Embedded React dashboard)
