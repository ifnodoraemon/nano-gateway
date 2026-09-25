package router

import (
	"context"
	"fmt"
	"sort"
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
	rrIndices      map[string]int // round-robin index per model
	circuitBreaker *CircuitBreaker
}

// NewDispatcher creates a new Dispatcher instance.
func NewDispatcher(channels []model.ChannelConfig) *Dispatcher {
	d := &Dispatcher{
		channels:       channels,
		providers:      make(map[model.ProviderType]provider.Provider),
		rrIndices:      make(map[string]int),
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

// GetChannelsForModelAndProtocol returns matching channels for a given model and protocol.
func (d *Dispatcher) GetChannelsForModelAndProtocol(modelName, proto string) []*model.ChannelConfig {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var matched []*model.ChannelConfig
	for i := range d.channels {
		ch := &d.channels[i]
		if proto != "" && !ch.SupportsProtocol(proto) {
			continue
		}
		hasModel := false
		for _, m := range ch.Models {
			if m == modelName {
				hasModel = true
				break
			}
		}
		if !hasModel && ch.ModelMapping != nil {
			if _, ok := ch.ModelMapping[modelName]; ok {
				hasModel = true
			}
		}
		if hasModel {
			matched = append(matched, ch)
		}
	}

	// Sort by Priority ascending (1 is highest priority)
	sort.SliceStable(matched, func(i, j int) bool {
		if matched[i].Priority != matched[j].Priority {
			return matched[i].Priority < matched[j].Priority
		}
		return matched[i].Weight > matched[j].Weight
	})

	return matched
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

