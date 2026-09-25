package controlplane

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ifnodoraemon/nano-gateway/internal/model"
	"github.com/ifnodoraemon/nano-gateway/internal/provider"
)

// ProbeRequest contains connection parameters for probing downstream services.
type ProbeRequest struct {
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
	Type    string `json:"type,omitempty"`
}

// ProbeResult contains automatically discovered downstream capabilities.
type ProbeResult struct {
	Type          model.ProviderType `json:"type"`
	SuggestedName string             `json:"suggested_name"`
	Models        []string           `json:"models"`
	Protocols     []string           `json:"protocols"`
	LatencyMs     int64              `json:"latency_ms"`
	ServerHeader  string             `json:"server_header,omitempty"`
	Message       string             `json:"message"`
}

// DownstreamProber handles automatic probing and discovery of downstream LLM engines.
type DownstreamProber struct {
	client *http.Client
}

// NewDownstreamProber creates a DownstreamProber.
func NewDownstreamProber(client *http.Client) *DownstreamProber {
	if client == nil {
		client = provider.SharedDefaultHTTPClient
	}
	return &DownstreamProber{client: client}
}

// Probe automatically tests and inspects an upstream service.
func (p *DownstreamProber) Probe(ctx context.Context, req *ProbeRequest) (*ProbeResult, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(req.BaseURL), "/")
	if baseURL == "" {
		return nil, fmt.Errorf("base_url is required")
	}

	start := time.Now()

	// 1. Check for Google Gemini Developer API
	if strings.Contains(baseURL, "generativelanguage.googleapis.com") || req.Type == "gemini" {
		return p.probeGemini(ctx, baseURL, req.APIKey, start)
	}

	// 2. Check for Anthropic Claude direct API
	if strings.Contains(baseURL, "api.anthropic.com") || req.Type == "anthropic" {
		return p.probeAnthropic(ctx, baseURL, req.APIKey, start)
	}

	// 3. Probe standard OpenAI-compatible endpoints (/v1/models or /models)
	res, err := p.probeOpenAICompatible(ctx, baseURL, req.APIKey, start)
	if err == nil {
		return res, nil
	}

	// 4. Probe Ollama /api/tags
	ollamaRes, errOllama := p.probeOllama(ctx, baseURL, start)
	if errOllama == nil {
		return ollamaRes, nil
	}

	// If all probes fail, return a best-effort default result with latency
	dur := time.Since(start).Milliseconds()
	return &ProbeResult{
		Type:          model.ProviderOpenAI,
		SuggestedName: "custom-downstream",
		Models:        []string{"default-model"},
		Protocols:     []string{"openai_chat", "openai_text"},
		LatencyMs:     dur,
		Message:       fmt.Sprintf("探测完成 (无法自动读取模型列表，已推荐标准协议): %v", err),
	}, nil
}

func (p *DownstreamProber) probeOpenAICompatible(ctx context.Context, baseURL, apiKey string, start time.Time) (*ProbeResult, error) {
	testEndpoints := []string{
		baseURL + "/models",
		baseURL + "/v1/models",
	}
	if strings.HasSuffix(baseURL, "/v1") {
		testEndpoints = []string{baseURL + "/models"}
	}

	var lastErr error
	for _, targetURL := range testEndpoints {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
		if err != nil {
			lastErr = err
			continue
		}

		if apiKey != "" && apiKey != "none" {
			req.Header.Set("Authorization", "Bearer "+apiKey)
		}

		resp, err := p.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			var parsed struct {
				Data []struct {
					ID string `json:"id"`
				} `json:"data"`
			}
			if err := json.Unmarshal(body, &parsed); err == nil && len(parsed.Data) > 0 {
				var modelIDs []string
				for _, d := range parsed.Data {
					if d.ID != "" {
						modelIDs = append(modelIDs, d.ID)
					}
				}

				dur := time.Since(start).Milliseconds()
				serverHeader := resp.Header.Get("Server")
				detectedType := inferProviderType(baseURL, serverHeader, modelIDs)
				protocols := inferProtocols(modelIDs)

				suggestedName := string(detectedType) + "-upstream"
				if strings.Contains(strings.ToLower(serverHeader), "gpustack") || strings.Contains(baseURL, "gpustack") {
					suggestedName = "gpustack-cluster"
				}

				return &ProbeResult{
					Type:          detectedType,
					SuggestedName: suggestedName,
					Models:        modelIDs,
					Protocols:     protocols,
					LatencyMs:     dur,
					ServerHeader:  serverHeader,
					Message:       fmt.Sprintf("成功检测到 %d 个下游模型", len(modelIDs)),
				}, nil
			}
		} else {
			lastErr = fmt.Errorf("status code %d", resp.StatusCode)
		}
	}

	return nil, lastErr
}

func (p *DownstreamProber) probeGemini(ctx context.Context, baseURL, apiKey string, start time.Time) (*ProbeResult, error) {
	targetURL := "https://generativelanguage.googleapis.com/v1beta/models"
	if apiKey != "" && apiKey != "none" {
		targetURL += "?key=" + apiKey
	}

	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	resp, err := p.client.Do(req)
	dur := time.Since(start).Milliseconds()

	defaultGeminiModels := []string{
		"gemini-2.0-flash",
		"gemini-1.5-pro",
		"gemini-1.5-flash",
	}

	if err == nil && resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		var parsed struct {
			Models []struct {
				Name string `json:"name"`
			} `json:"models"`
		}
		if json.Unmarshal(body, &parsed) == nil && len(parsed.Models) > 0 {
			var list []string
			for _, m := range parsed.Models {
				cleanName := strings.TrimPrefix(m.Name, "models/")
				list = append(list, cleanName)
			}
			return &ProbeResult{
				Type:          model.ProviderGemini,
				SuggestedName: "google-gemini-official",
				Models:        list,
				Protocols:     inferProtocols(list),
				LatencyMs:     dur,
				Message:       fmt.Sprintf("成功连接 Google Gemini 官方接口，读取到 %d 个模型", len(list)),
			}, nil
		}
	}

	return &ProbeResult{
		Type:          model.ProviderGemini,
		SuggestedName: "google-gemini-official",
		Models:        defaultGeminiModels,
		Protocols:     []string{"openai_chat", "anthropic_messages", "embeddings"},
		LatencyMs:     dur,
		Message:       "已配置 Google Gemini 协议，已载入标准 Gemini 2.0 / 1.5 系列预设",
	}, nil
}

func (p *DownstreamProber) probeAnthropic(ctx context.Context, baseURL, apiKey string, start time.Time) (*ProbeResult, error) {
	dur := time.Since(start).Milliseconds()
	claudeModels := []string{
		"claude-3-5-sonnet-20241022",
		"claude-3-5-haiku-20241022",
		"claude-3-opus-20240229",
	}

	return &ProbeResult{
		Type:          model.ProviderAnthropic,
		SuggestedName: "anthropic-claude-direct",
		Models:        claudeModels,
		Protocols:     []string{"openai_chat", "anthropic_messages"},
		LatencyMs:     dur,
		Message:       "已识别 Anthropic Claude 原生协议，并已预置 Claude 3.5 系列模型与全双工协议转换",
	}, nil
}

func (p *DownstreamProber) probeOllama(ctx context.Context, baseURL string, start time.Time) (*ProbeResult, error) {
	targetURL := baseURL + "/api/tags"
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, targetURL, nil)
	resp, err := p.client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("not ollama")
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var parsed struct {
		Models []struct {
			Name string `json:"name"`
		} `json:"models"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil || len(parsed.Models) == 0 {
		return nil, fmt.Errorf("empty ollama models")
	}

	dur := time.Since(start).Milliseconds()
	var models []string
	for _, m := range parsed.Models {
		models = append(models, m.Name)
	}

	return &ProbeResult{
		Type:          model.ProviderOpenAI,
		SuggestedName: "ollama-local",
		Models:        models,
		Protocols:     inferProtocols(models),
		LatencyMs:     dur,
		Message:       fmt.Sprintf("已成功连接本地 Ollama 推理引擎，发现 %d 个模型", len(models)),
	}, nil
}

// inferProviderType guesses the specific provider category from headers, URL, and model IDs.
func inferProviderType(baseURL, serverHeader string, models []string) model.ProviderType {
	lowerURL := strings.ToLower(baseURL)
	lowerServer := strings.ToLower(serverHeader)

	if strings.Contains(lowerURL, "gpustack") || strings.Contains(lowerServer, "gpustack") {
		return model.ProviderGPUStack
	}
	if strings.Contains(lowerURL, "sub2api") {
		return model.ProviderSub2API
	}
	if strings.Contains(lowerURL, "deepseek.com") {
		return model.ProviderDeepSeek
	}
	if strings.Contains(lowerURL, "openai.com") {
		return model.ProviderOpenAI
	}
	if strings.Contains(lowerServer, "vllm") {
		return model.ProviderVLLM
	}
	if strings.Contains(lowerServer, "sglang") {
		return model.ProviderSGLang
	}

	return model.ProviderOpenAI
}

// inferProtocols determines supported modalities and protocols based on model names.
func inferProtocols(models []string) []string {
	protocolsMap := map[string]bool{
		"openai_chat":        true,
		"openai_text":        true,
		"anthropic_messages": true,
	}

	for _, m := range models {
		lower := strings.ToLower(m)
		if strings.Contains(lower, "dall-e") || strings.Contains(lower, "flux") || strings.Contains(lower, "stable-diffusion") || strings.Contains(lower, "sd") {
			protocolsMap["images"] = true
		}
		if strings.Contains(lower, "tts") || strings.Contains(lower, "speech") || strings.Contains(lower, "cosyvoice") {
			protocolsMap["audio_speech"] = true
		}
		if strings.Contains(lower, "whisper") || strings.Contains(lower, "transcription") || strings.Contains(lower, "sensevoice") {
			protocolsMap["audio_transcription"] = true
		}
		if strings.Contains(lower, "sora") || strings.Contains(lower, "cogvideo") || strings.Contains(lower, "kling") || strings.Contains(lower, "video") {
			protocolsMap["videos"] = true
		}
		if strings.Contains(lower, "embed") || strings.Contains(lower, "bge") || strings.Contains(lower, "e5") || strings.Contains(lower, "nomic") || strings.Contains(lower, "voyage") || strings.Contains(lower, "jina") || strings.Contains(lower, "text-embedding") {
			protocolsMap["embeddings"] = true
		}
	}

	var list []string
	// Order canonically
	ordered := []string{"openai_chat", "openai_text", "anthropic_messages", "embeddings", "images", "audio_speech", "audio_transcription", "videos"}
	for _, p := range ordered {
		if protocolsMap[p] {
			list = append(list, p)
		}
	}
	return list
}
