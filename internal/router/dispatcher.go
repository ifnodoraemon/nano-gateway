package router

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/ifnodoraemon/nano-gateway/internal/model"
	"github.com/ifnodoraemon/nano-gateway/internal/provider"
	"github.com/ifnodoraemon/nano-gateway/internal/telemetry"
)

// Dispatcher routes requests to appropriate providers with intelligent fallback.
type Dispatcher struct {
	mu             sync.RWMutex
	channels       []model.ChannelConfig
	providers      map[model.ProviderType]provider.Provider
	wrrMu          sync.Mutex
	wrrWeights     map[string]int // model:channel_name -> current_weight
	circuitBreaker *CircuitBreaker
}

// NewDispatcher creates a new Dispatcher instance.
func NewDispatcher(channels []model.ChannelConfig) *Dispatcher {
	d := &Dispatcher{
		channels:       channels,
		providers:      make(map[model.ProviderType]provider.Provider),
		wrrWeights:     make(map[string]int),
		circuitBreaker: NewCircuitBreaker(3, 30*time.Second),
	}

	// Register default providers
	openAIProv := provider.NewOpenAIProvider(nil)
	d.providers[model.ProviderOpenAI] = openAIProv
	d.providers[model.ProviderDeepSeek] = openAIProv
	d.providers[model.ProviderVLLM] = openAIProv
	d.providers[model.ProviderSGLang] = openAIProv
	d.providers[model.ProviderOllama] = openAIProv
	d.providers[model.ProviderSub2API] = openAIProv
	d.providers[model.ProviderGPUStack] = openAIProv
	d.providers[model.ProviderCustom] = openAIProv

	anthropicProv := provider.NewAnthropicProvider(nil)
	d.providers[model.ProviderAnthropic] = anthropicProv

	geminiProv := provider.NewGeminiProvider(nil)
	d.providers[model.ProviderGemini] = geminiProv

	return d
}

// RegisterProvider registers a custom provider.
func (d *Dispatcher) RegisterProvider(p provider.Provider) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.providers[p.Type()] = p
}

// UpdateChannels updates channel configurations dynamically.
func (d *Dispatcher) UpdateChannels(channels []model.ChannelConfig) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.channels = channels
}

// GetChannelsForModel returns matching channels for a given model, sorted by priority.
func (d *Dispatcher) GetChannelsForModel(modelName string) []*model.ChannelConfig {
	return d.GetChannelsForModelAndProtocol(modelName, "")
}

// GetChannelsForModelAndProtocol returns matching channels for a given model and protocol,
// grouped by priority tiers and balanced via Smooth Weighted Round-Robin (SWRR) within each tier.
func (d *Dispatcher) GetChannelsForModelAndProtocol(modelName, proto string) []*model.ChannelConfig {
	d.mu.RLock()
	var matched []*model.ChannelConfig
	for i := range d.channels {
		ch := &d.channels[i]
		if proto != "" && !ch.SupportsProtocol(proto) {
			continue
		}
		if ch.SupportsModel(modelName) {
			matched = append(matched, ch)
		}
	}
	d.mu.RUnlock()

	if len(matched) <= 1 {
		return matched
	}

	// Group channels by Priority
	priorityGroups := make(map[int][]*model.ChannelConfig)
	var priorities []int
	for _, ch := range matched {
		p := ch.Priority
		if len(priorityGroups[p]) == 0 {
			priorities = append(priorities, p)
		}
		priorityGroups[p] = append(priorityGroups[p], ch)
	}
	sort.Ints(priorities)

	var result []*model.ChannelConfig
	d.wrrMu.Lock()
	defer d.wrrMu.Unlock()

	for _, p := range priorities {
		group := priorityGroups[p]
		if len(group) == 1 {
			result = append(result, group[0])
			continue
		}

		// Smooth Weighted Round-Robin (SWRR) to balance within same priority tier
		totalWeight := 0
		maxWeight := -1 << 31
		winnerIdx := 0

		for i, ch := range group {
			w := ch.Weight
			if w <= 0 {
				w = 1
			}
			totalWeight += w

			key := modelName + ":" + ch.Name
			cur := d.wrrWeights[key] + w
			d.wrrWeights[key] = cur
			if cur > maxWeight {
				maxWeight = cur
				winnerIdx = i
			}
		}

		winnerKey := modelName + ":" + group[winnerIdx].Name
		d.wrrWeights[winnerKey] -= totalWeight

		// Winner is tried first
		result = append(result, group[winnerIdx])

		// Remaining channels in this tier serve as immediate fallbacks
		for i, ch := range group {
			if i != winnerIdx {
				result = append(result, ch)
			}
		}
	}

	return result
}

// GetAllSupportedModels returns a deduplicated list of all configured models.
func (d *Dispatcher) GetAllSupportedModels() []string {
	d.mu.RLock()
	defer d.mu.RUnlock()

	modelSet := make(map[string]struct{})
	for _, ch := range d.channels {
		for _, m := range ch.Models {
			modelSet[m] = struct{}{}
		}
		for alias := range ch.ModelMapping {
			modelSet[alias] = struct{}{}
		}
	}

	var list []string
	for m := range modelSet {
		list = append(list, m)
	}
	sort.Strings(list)
	return list
}

// Dispatch executes non-streaming chat with automatic fallback.
func (d *Dispatcher) Dispatch(ctx context.Context, req *model.ChatCompletionRequest) (*model.ChatCompletionResponse, error) {
	channels := d.GetChannelsForModelAndProtocol(req.Model, "chat")
	if len(channels) == 0 {
		channels = d.GetChannelsForModel(req.Model)
	}
	if len(channels) == 0 {
		return nil, fmt.Errorf("no upstream provider available for requested model '%s'", req.Model)
	}

	var lastErr error
	for i, ch := range channels {
		// High-Availability Circuit Breaker: fail fast if upstream is down
		if !d.circuitBreaker.CanExecute(ch.Name) {
			telemetry.Logger.Warn("circuit breaker is OPEN, bypassing dead upstream", "channel", ch.Name)
			continue
		}

		d.mu.RLock()
		prov, exists := d.providers[ch.Type]
		d.mu.RUnlock()

		if !exists {
			lastErr = fmt.Errorf("unsupported provider type '%s' on channel %s", ch.Type, ch.Name)
			telemetry.Logger.Warn("provider type not found", "channel", ch.Name, "type", ch.Type)
			continue
		}

		telemetry.Logger.Info("attempting chat completion",
			"channel", ch.Name,
			"model", req.Model,
			"attempt", i+1,
			"total_channels", len(channels),
		)

		start := time.Now()
		resp, err := prov.ChatComplete(ctx, req, ch)
		if err == nil {
			d.circuitBreaker.RecordSuccess(ch.Name)
			dur := time.Since(start)
			promptTokens := 0
			compTokens := 0
			if resp.Usage != nil {
				promptTokens = resp.Usage.PromptTokens
				compTokens = resp.Usage.CompletionTokens
			}
			telemetry.GlobalMetrics.RecordRequest(true, dur, promptTokens, compTokens)
			telemetry.Logger.Info("chat completion succeeded",
				"channel", ch.Name,
				"duration_ms", dur.Milliseconds(),
				"total_tokens", promptTokens+compTokens,
			)
			return resp, nil
		}

		d.circuitBreaker.RecordFailure(ch.Name)
		lastErr = err
		telemetry.GlobalMetrics.RecordFallback()
		telemetry.Logger.Warn("channel execution failed, triggering fallback",
			"channel", ch.Name,
			"error", err.Error(),
			"fallback_index", i+1,
		)
	}

	telemetry.GlobalMetrics.RecordRequest(false, 0, 0, 0)
	return nil, fmt.Errorf("all %d candidate channels failed for model %s. Last error: %w", len(channels), req.Model, lastErr)
}

// DispatchStream executes streaming chat with Safe Fallback Window before the first token.
func (d *Dispatcher) DispatchStream(ctx context.Context, req *model.ChatCompletionRequest) (<-chan *model.StreamEvent, error) {
	channels := d.GetChannelsForModelAndProtocol(req.Model, "chat")
	if len(channels) == 0 {
		channels = d.GetChannelsForModel(req.Model)
	}
	if len(channels) == 0 {
		return nil, fmt.Errorf("no upstream provider available for requested model '%s'", req.Model)
	}

	var lastErr error
	for i, ch := range channels {
		// High-Availability Circuit Breaker: fail fast if upstream is down
		if !d.circuitBreaker.CanExecute(ch.Name) {
			telemetry.Logger.Warn("circuit breaker is OPEN, bypassing dead upstream stream", "channel", ch.Name)
			continue
		}

		d.mu.RLock()
		prov, exists := d.providers[ch.Type]
		d.mu.RUnlock()

		if !exists {
			lastErr = fmt.Errorf("unsupported provider type '%s' on channel %s", ch.Type, ch.Name)
			continue
		}

		telemetry.Logger.Info("attempting streaming connection",
			"channel", ch.Name,
			"model", req.Model,
			"attempt", i+1,
		)

		streamChan, err := prov.ChatCompleteStream(ctx, req, ch)
		if err != nil {
			d.circuitBreaker.RecordFailure(ch.Name)
			lastErr = err
			telemetry.GlobalMetrics.RecordFallback()
			telemetry.Logger.Warn("stream connection failed, trying next channel",
				"channel", ch.Name,
				"error", err.Error(),
			)
			continue
		}

		// Safe Fallback Window: wait for the first event to confirm healthy stream
		select {
		case firstEvent, ok := <-streamChan:
			if !ok {
				d.circuitBreaker.RecordFailure(ch.Name)
				lastErr = fmt.Errorf("channel %s closed stream without events", ch.Name)
				telemetry.GlobalMetrics.RecordFallback()
				continue
			}

			if firstEvent.Err != nil {
				d.circuitBreaker.RecordFailure(ch.Name)
				lastErr = firstEvent.Err
				telemetry.GlobalMetrics.RecordFallback()
				telemetry.Logger.Warn("channel failed before first valid token, falling back",
					"channel", ch.Name,
					"error", firstEvent.Err.Error(),
				)
				continue
			}

			// First token healthy! Mark healthy in circuit breaker
			d.circuitBreaker.RecordSuccess(ch.Name)

			// Wrap and return combined stream
			outChan := make(chan *model.StreamEvent, 64)
			go func(first *model.StreamEvent, in <-chan *model.StreamEvent) {
				defer close(outChan)
				outChan <- first
				for event := range in {
					outChan <- event
				}
			}(firstEvent, streamChan)

			return outChan, nil

		case <-time.After(15 * time.Second):
			d.circuitBreaker.RecordFailure(ch.Name)
			lastErr = fmt.Errorf("channel %s timed out waiting for first token", ch.Name)
			telemetry.GlobalMetrics.RecordFallback()
			telemetry.Logger.Warn("first token timeout, falling back", "channel", ch.Name)
			continue

		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	return nil, fmt.Errorf("all channels failed for stream request on model %s. Last error: %w", req.Model, lastErr)
}

// GetBreakerStatus returns the circuit breaker status of a channel.
func (d *Dispatcher) GetBreakerStatus(name string) string {
	if d.circuitBreaker == nil {
		return "CLOSED"
	}
	return d.circuitBreaker.GetStatus(name).String()
}

// =============================================================================
// Unified Multimodal Forwarding Pipeline (Images, Audio, Video, Generic HTTP)
// =============================================================================

// UpstreamRequest represents a generic HTTP request across any modality.
type UpstreamRequest struct {
	Path        string            // e.g. "/v1/images/generations", "/v1/audio/speech"
	Method      string            // "POST", "GET"
	Headers     map[string]string // custom headers
	Body        []byte            // serialized payload
	ContentType string            // "application/json", "multipart/form-data"
	Model       string            // requested model for routing
	Protocol    string            // e.g. "images", "audio_speech", "videos"
}

// UpstreamResponse encapsulates a generic HTTP response across any modality.
type UpstreamResponse struct {
	StatusCode int
	Headers    http.Header
	Body       []byte
	Stream     io.ReadCloser
}

// RewriteJSONModel cleanly updates the "model" field in a JSON payload.
func RewriteJSONModel(body []byte, newModel string) []byte {
	if len(body) == 0 {
		return body
	}
	var rawMap map[string]any
	if err := json.Unmarshal(body, &rawMap); err != nil {
		return body
	}
	rawMap["model"] = newModel
	rewritten, err := json.Marshal(rawMap)
	if err != nil {
		return body
	}
	return rewritten
}

// DispatchHTTP routes an HTTP request across matching candidate channels with Circuit Breaking and Safe Fallback.
func (d *Dispatcher) DispatchHTTP(ctx context.Context, req *UpstreamRequest) (*UpstreamResponse, error) {
	channels := d.GetChannelsForModelAndProtocol(req.Model, req.Protocol)
	if len(channels) == 0 {
		channels = d.GetChannelsForModel(req.Model)
	}
	if len(channels) == 0 {
		return nil, fmt.Errorf("no upstream provider available for model '%s' and protocol '%s'", req.Model, req.Protocol)
	}

	var lastErr error
	for i, ch := range channels {
		// Circuit Breaker: fail fast if upstream is down
		if !d.circuitBreaker.CanExecute(ch.Name) {
			telemetry.Logger.Warn("circuit breaker is OPEN, bypassing dead upstream", "channel", ch.Name)
			continue
		}

		targetModel := ch.GetUpstreamModel(req.Model)
		targetBody := req.Body
		if strings.Contains(req.ContentType, "application/json") && len(targetBody) > 0 {
			targetBody = RewriteJSONModel(targetBody, targetModel)
		}

		targetURL := strings.TrimRight(ch.BaseURL, "/") + req.Path
		httpReq, err := http.NewRequestWithContext(ctx, req.Method, targetURL, bytes.NewReader(targetBody))
		if err != nil {
			lastErr = err
			continue
		}

		if req.ContentType != "" {
			httpReq.Header.Set("Content-Type", req.ContentType)
		}
		if ch.APIKey != "" && ch.APIKey != "none" {
			httpReq.Header.Set("Authorization", "Bearer "+ch.APIKey)
			httpReq.Header.Set("x-api-key", ch.APIKey)
		}
		for k, v := range req.Headers {
			httpReq.Header.Set(k, v)
		}

		start := time.Now()
		httpResp, err := provider.SharedDefaultHTTPClient.Do(httpReq)
		if err != nil {
			d.circuitBreaker.RecordFailure(ch.Name)
			lastErr = err
			telemetry.GlobalMetrics.RecordFallback()
			telemetry.Logger.Warn("upstream HTTP request failed, falling back",
				"channel", ch.Name,
				"error", err.Error(),
				"attempt", i+1,
			)
			continue
		}

		// Check if response indicates server error or rate limit
		if httpResp.StatusCode == http.StatusTooManyRequests || httpResp.StatusCode >= http.StatusInternalServerError {
			d.circuitBreaker.RecordFailure(ch.Name)
			bodyBytes, _ := io.ReadAll(httpResp.Body)
			httpResp.Body.Close()
			lastErr = fmt.Errorf("upstream %s returned status %d: %s", ch.Name, httpResp.StatusCode, string(bodyBytes))
			telemetry.GlobalMetrics.RecordFallback()
			telemetry.Logger.Warn("upstream returned server error, falling back",
				"channel", ch.Name,
				"status", httpResp.StatusCode,
				"attempt", i+1,
			)
			continue
		}

		// Success! Mark circuit breaker healthy
		d.circuitBreaker.RecordSuccess(ch.Name)
		dur := time.Since(start)
		telemetry.GlobalMetrics.RecordRequest(true, dur, 0, 0)

		return &UpstreamResponse{
			StatusCode: httpResp.StatusCode,
			Headers:    httpResp.Header,
			Stream:     httpResp.Body,
		}, nil
	}

	telemetry.GlobalMetrics.RecordRequest(false, 0, 0, 0)
	return nil, fmt.Errorf("all %d providers failed for model '%s'. Last error: %w", len(channels), req.Model, lastErr)
}

// DispatchEmbedding routes an embedding request across matching candidate channels with Circuit Breaking and Safe Fallback.
func (d *Dispatcher) DispatchEmbedding(ctx context.Context, req *model.EmbeddingRequest) (*model.EmbeddingResponse, error) {
	channels := d.GetChannelsForModelAndProtocol(req.Model, "embeddings")
	if len(channels) == 0 {
		channels = d.GetChannelsForModel(req.Model)
	}
	if len(channels) == 0 {
		return nil, fmt.Errorf("no upstream provider available for embedding model '%s'", req.Model)
	}

	var lastErr error
	for i, ch := range channels {
		if !d.circuitBreaker.CanExecute(ch.Name) {
			telemetry.Logger.Warn("circuit breaker is OPEN, bypassing dead upstream", "channel", ch.Name)
			continue
		}

		start := time.Now()
		var resp *model.EmbeddingResponse
		var err error

		if ch.Type == model.ProviderGemini {
			geminiProv, ok := d.providers[model.ProviderGemini].(*provider.GeminiProvider)
			if !ok {
				geminiProv = provider.NewGeminiProvider(nil)
			}
			resp, err = geminiProv.Embed(ctx, req, ch)
		} else {
			openAIProv, ok := d.providers[model.ProviderOpenAI].(*provider.OpenAIProvider)
			if !ok {
				openAIProv = provider.NewOpenAIProvider(nil)
			}
			resp, err = openAIProv.Embed(ctx, req, ch)
		}

		if err != nil {
			d.circuitBreaker.RecordFailure(ch.Name)
			lastErr = err
			telemetry.GlobalMetrics.RecordFallback()
			telemetry.Logger.Warn("upstream embedding request failed, falling back",
				"channel", ch.Name,
				"error", err.Error(),
				"attempt", i+1,
			)
			continue
		}

		d.circuitBreaker.RecordSuccess(ch.Name)
		dur := time.Since(start)
		telemetry.GlobalMetrics.RecordRequest(true, dur, resp.Usage.PromptTokens, 0)
		return resp, nil
	}

	telemetry.GlobalMetrics.RecordRequest(false, 0, 0, 0)
	return nil, fmt.Errorf("all %d providers failed for embedding model '%s'. Last error: %w", len(channels), req.Model, lastErr)
}

// DispatchRerank routes a cross-encoder rerank request across candidate channels with Circuit Breaking and Safe Fallback.
func (d *Dispatcher) DispatchRerank(ctx context.Context, req *model.RerankRequest) (*model.RerankResponse, error) {
	channels := d.GetChannelsForModelAndProtocol(req.Model, "rerank")
	if len(channels) == 0 {
		channels = d.GetChannelsForModel(req.Model)
	}
	if len(channels) == 0 {
		return nil, fmt.Errorf("no upstream provider available for rerank model '%s'", req.Model)
	}

	var lastErr error
	for i, ch := range channels {
		if !d.circuitBreaker.CanExecute(ch.Name) {
			telemetry.Logger.Warn("circuit breaker is OPEN, bypassing dead upstream", "channel", ch.Name)
			continue
		}

		start := time.Now()
		openAIProv, ok := d.providers[model.ProviderOpenAI].(*provider.OpenAIProvider)
		if !ok {
			openAIProv = provider.NewOpenAIProvider(nil)
		}

		resp, err := openAIProv.Rerank(ctx, req, ch)
		if err != nil {
			d.circuitBreaker.RecordFailure(ch.Name)
			lastErr = err
			telemetry.GlobalMetrics.RecordFallback()
			telemetry.Logger.Warn("upstream rerank request failed, falling back",
				"channel", ch.Name,
				"error", err.Error(),
				"attempt", i+1,
			)
			continue
		}

		d.circuitBreaker.RecordSuccess(ch.Name)
		dur := time.Since(start)
		telemetry.GlobalMetrics.RecordRequest(true, dur, resp.Usage.TotalTokens, 0)
		return resp, nil
	}

	telemetry.GlobalMetrics.RecordRequest(false, 0, 0, 0)
	return nil, fmt.Errorf("all %d providers failed for rerank model '%s'. Last error: %w", len(channels), req.Model, lastErr)
}



