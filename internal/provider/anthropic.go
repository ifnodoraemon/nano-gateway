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

// AnthropicProvider implements Provider for Anthropic Messages API.
type AnthropicProvider struct {
	client *http.Client
}

// NewAnthropicProvider creates a new Anthropic provider.
func NewAnthropicProvider(client *http.Client) *AnthropicProvider {
	if client == nil {
		client = SharedDefaultHTTPClient
	}
	return &AnthropicProvider{client: client}
}

func (p *AnthropicProvider) Name() string {
	return "anthropic"
}

func (p *AnthropicProvider) Type() model.ProviderType {
	return model.ProviderAnthropic
}

// AnthropicRequest represents the Anthropic Messages API payload.
type AnthropicRequest struct {
	Model       string             `json:"model"`
	Messages    []AnthropicMessage `json:"messages"`
	System      string             `json:"system,omitempty"`
	MaxTokens   int                `json:"max_tokens"`
	Temperature *float64           `json:"temperature,omitempty"`
	TopP        *float64           `json:"top_p,omitempty"`
	Stream      bool               `json:"stream,omitempty"`
}

type AnthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type AnthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text,omitempty"`
}

type AnthropicUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

type AnthropicResponse struct {
	ID         string                  `json:"id"`
	Type       string                  `json:"type"`
	Role       string                  `json:"role"`
	Content    []AnthropicContentBlock `json:"content"`
	Model      string                  `json:"model"`
	StopReason string                  `json:"stop_reason"`
	Usage      AnthropicUsage          `json:"usage"`
}

// convertOpenAIToAnthropic converts OpenAI ChatCompletionRequest to Anthropic format.
func convertOpenAIToAnthropic(req *model.ChatCompletionRequest, channel *model.ChannelConfig) *AnthropicRequest {
	var systemParts []string
	var anthropicMsgs []AnthropicMessage

	for _, msg := range req.Messages {
		if strings.ToLower(msg.Role) == "system" {
			systemParts = append(systemParts, msg.GetContentString())
		} else {
			anthropicMsgs = append(anthropicMsgs, AnthropicMessage{
				Role:    msg.Role,
				Content: msg.GetContentString(),
			})
		}
	}

	maxTokens := 4096
	if req.MaxTokens != nil && *req.MaxTokens > 0 {
		maxTokens = *req.MaxTokens
	}

	return &AnthropicRequest{
		Model:       channel.GetUpstreamModel(req.Model),
		Messages:    anthropicMsgs,
		System:      strings.Join(systemParts, "\n\n"),
		MaxTokens:   maxTokens,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		Stream:      req.Stream,
	}
}

// ChatComplete executes a non-streaming Anthropic request and converts the response to OpenAI format.
func (p *AnthropicProvider) ChatComplete(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (*model.ChatCompletionResponse, error) {
	anthropicReq := convertOpenAIToAnthropic(req, channel)
	anthropicReq.Stream = false

	payloadBytes, err := json.Marshal(anthropicReq)
	if err != nil {
		return nil, fmt.Errorf("marshal anthropic request error: %w", err)
	}

	baseURL := strings.TrimRight(channel.BaseURL, "/")
	if !strings.HasSuffix(baseURL, "/v1/messages") {
		baseURL += "/v1/messages"
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("create anthropic http request error: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", channel.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do anthropic request error: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read anthropic body error: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream anthropic %s returned %d: %s", channel.Name, resp.StatusCode, string(bodyBytes))
	}

	var anthropicResp AnthropicResponse
	if err := json.Unmarshal(bodyBytes, &anthropicResp); err != nil {
		return nil, fmt.Errorf("unmarshal anthropic response error: %w", err)
	}

	var fullContent strings.Builder
	for _, block := range anthropicResp.Content {
		if block.Type == "text" {
			fullContent.WriteString(block.Text)
		}
	}

	finishReason := "stop"
	if anthropicResp.StopReason == "max_tokens" {
		finishReason = "length"
	}

	openAIResp := &model.ChatCompletionResponse{
		ID:      anthropicResp.ID,
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   req.Model,
		Choices: []model.ChatCompletionChoice{
			{
				Index: 0,
				Message: model.ChatMessage{
					Role:    "assistant",
					Content: fullContent.String(),
				},
				FinishReason: &finishReason,
			},
		},
		Usage: &model.Usage{
			PromptTokens:     anthropicResp.Usage.InputTokens,
			CompletionTokens: anthropicResp.Usage.OutputTokens,
			TotalTokens:      anthropicResp.Usage.InputTokens + anthropicResp.Usage.OutputTokens,
		},
	}

	return openAIResp, nil
}

// ChatCompleteStream executes a streaming Anthropic request and translates SSE chunks to OpenAI format.
func (p *AnthropicProvider) ChatCompleteStream(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (<-chan *model.StreamEvent, error) {
	anthropicReq := convertOpenAIToAnthropic(req, channel)
	anthropicReq.Stream = true

	payloadBytes, err := json.Marshal(anthropicReq)
	if err != nil {
		return nil, fmt.Errorf("marshal anthropic request error: %w", err)
	}

	baseURL := strings.TrimRight(channel.BaseURL, "/")
	if !strings.HasSuffix(baseURL, "/v1/messages") {
		baseURL += "/v1/messages"
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("create anthropic http request error: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("x-api-key", channel.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("connect to anthropic %s stream error: %w", channel.Name, err)
	}

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("upstream anthropic %s returned %d: %s", channel.Name, resp.StatusCode, string(bodyBytes))
	}

	eventChan := make(chan *model.StreamEvent, 64)

	go func() {
		defer resp.Body.Close()
		defer close(eventChan)

		reader := bufio.NewReader(resp.Body)
		messageID := fmt.Sprintf("chatcmpl-claude-%d", time.Now().Unix())
		created := time.Now().Unix()

		var currentEvent string
		inputTokens := 0
		outputTokens := 0

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

			if strings.HasPrefix(lineStr, "event:") {
				currentEvent = strings.TrimSpace(strings.TrimPrefix(lineStr, "event:"))
				continue
			}

			if strings.HasPrefix(lineStr, "data:") {
				dataStr := strings.TrimSpace(strings.TrimPrefix(lineStr, "data:"))
				var eventMap map[string]any
				if err := json.Unmarshal([]byte(dataStr), &eventMap); err != nil {
					continue
				}

				switch currentEvent {
				case "message_start":
					if msgObj, ok := eventMap["message"].(map[string]any); ok {
						if id, ok := msgObj["id"].(string); ok && id != "" {
							messageID = id
						}
						if u, ok := msgObj["usage"].(map[string]any); ok {
							if in, ok := u["input_tokens"].(float64); ok {
								inputTokens = int(in)
							}
						}
					}
					// Emit initial chunk with role assistant
					chunk := &model.ChatCompletionChunk{
						ID:      messageID,
						Object:  "chat.completion.chunk",
						Created: created,
						Model:   req.Model,
						Choices: []model.ChunkChoice{
							{
								Index: 0,
								Delta: model.ChunkDelta{
									Role: "assistant",
								},
							},
						},
					}
					eventChan <- &model.StreamEvent{Chunk: chunk}

				case "content_block_delta":
					if delta, ok := eventMap["delta"].(map[string]any); ok {
						if text, ok := delta["text"].(string); ok && text != "" {
							chunk := &model.ChatCompletionChunk{
								ID:      messageID,
								Object:  "chat.completion.chunk",
								Created: created,
								Model:   req.Model,
								Choices: []model.ChunkChoice{
									{
										Index: 0,
										Delta: model.ChunkDelta{
											Content: text,
										},
									},
								},
							}
							eventChan <- &model.StreamEvent{Chunk: chunk}
						}
					}

				case "message_delta":
					if u, ok := eventMap["usage"].(map[string]any); ok {
						if out, ok := u["output_tokens"].(float64); ok {
							outputTokens = int(out)
						}
					}
					stopReason := "stop"
					if delta, ok := eventMap["delta"].(map[string]any); ok {
						if r, ok := delta["stop_reason"].(string); ok && r == "max_tokens" {
							stopReason = "length"
						}
					}

					chunk := &model.ChatCompletionChunk{
						ID:      messageID,
						Object:  "chat.completion.chunk",
						Created: created,
						Model:   req.Model,
						Choices: []model.ChunkChoice{
							{
								Index:        0,
								Delta:        model.ChunkDelta{},
								FinishReason: &stopReason,
							},
						},
						Usage: &model.Usage{
							PromptTokens:     inputTokens,
							CompletionTokens: outputTokens,
							TotalTokens:      inputTokens + outputTokens,
						},
					}
					eventChan <- &model.StreamEvent{Chunk: chunk}

				case "message_stop":
					eventChan <- &model.StreamEvent{IsDone: true}
					return
				}
			}
		}
	}()

	return eventChan, nil
}
