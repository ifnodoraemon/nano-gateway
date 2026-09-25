package provider

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ifnodoraemon/nano-gateway/internal/model"
)

// OpenAIProvider handles all OpenAI-compatible API endpoints (OpenAI, DeepSeek, vLLM, SGLang, Ollama).
type OpenAIProvider struct {
	client *http.Client
}

// NewOpenAIProvider creates an OpenAI compatible provider instance.
func NewOpenAIProvider(client *http.Client) *OpenAIProvider {
	if client == nil {
		client = &http.Client{
			Timeout: 180 * time.Second,
		}
	}
	return &OpenAIProvider{client: client}
}

func (p *OpenAIProvider) Name() string {
	return "openai-compatible"
}

func (p *OpenAIProvider) Type() model.ProviderType {
	return model.ProviderOpenAI
}

// buildURL joins base URL with /chat/completions cleanly.
func buildURL(baseURL string) string {
	baseURL = strings.TrimRight(baseURL, "/")
	if strings.HasSuffix(baseURL, "/chat/completions") {
		return baseURL
	}
	return baseURL + "/chat/completions"
}

// ChatComplete executes a non-streaming chat request.
func (p *OpenAIProvider) ChatComplete(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (*model.ChatCompletionResponse, error) {
	// Clone request and map model name
	clonedReq := *req
	clonedReq.Model = channel.GetUpstreamModel(req.Model)
	clonedReq.Stream = false

	payloadBytes, err := json.Marshal(clonedReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request error: %w", err)
	}

	targetURL := buildURL(channel.BaseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("create http request error: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	if channel.APIKey != "" && channel.APIKey != "none" {
		httpReq.Header.Set("Authorization", "Bearer "+channel.APIKey)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do http request to %s error: %w", channel.Name, err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response body error: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream %s returned status %d: %s", channel.Name, resp.StatusCode, string(bodyBytes))
	}

	var chatResp model.ChatCompletionResponse
	if err := json.Unmarshal(bodyBytes, &chatResp); err != nil {
		return nil, fmt.Errorf("unmarshal chat response error: %w", err)
	}

	return &chatResp, nil
}

// ChatCompleteStream executes a streaming chat request.
func (p *OpenAIProvider) ChatCompleteStream(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (<-chan *model.StreamEvent, error) {
	clonedReq := *req
	clonedReq.Model = channel.GetUpstreamModel(req.Model)
	clonedReq.Stream = true

	payloadBytes, err := json.Marshal(clonedReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request error: %w", err)
	}

	targetURL := buildURL(channel.BaseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("create http request error: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	if channel.APIKey != "" && channel.APIKey != "none" {
		httpReq.Header.Set("Authorization", "Bearer "+channel.APIKey)
	}

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("connect to %s stream error: %w", channel.Name, err)
	}

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("upstream %s returned status %d: %s", channel.Name, resp.StatusCode, string(bodyBytes))
	}

	eventChan := make(chan *model.StreamEvent, 64)

	go func() {
		defer resp.Body.Close()
		defer close(eventChan)

		reader := bufio.NewReader(resp.Body)
		for {
			select {
			case <-ctx.Done():
				eventChan <- &model.StreamEvent{Err: ctx.Err()}
				return
			default:
			}

			line, err := reader.ReadBytes('\n')
			if err != nil {
				if err != io.EOF {
					eventChan <- &model.StreamEvent{Err: err}
				}
				return
			}

			lineStr := strings.TrimSpace(string(line))
			if lineStr == "" {
				continue
			}

			if !strings.HasPrefix(lineStr, "data:") {
				continue
			}

			dataContent := strings.TrimSpace(strings.TrimPrefix(lineStr, "data:"))
			if dataContent == "[DONE]" {
				eventChan <- &model.StreamEvent{IsDone: true}
				return
			}

			var chunk model.ChatCompletionChunk
			if err := json.Unmarshal([]byte(dataContent), &chunk); err != nil {
				// send raw event if parsing fails
				eventChan <- &model.StreamEvent{Raw: line}
				continue
			}

			eventChan <- &model.StreamEvent{
				Chunk: &chunk,
				Raw:   line,
			}
		}
	}()

	return eventChan, nil
}
