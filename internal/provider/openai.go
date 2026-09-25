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

	"github.com/ifnodoraemon/nano-gateway/internal/model"
)

// OpenAIProvider handles all OpenAI-compatible API endpoints (OpenAI, DeepSeek, vLLM, SGLang, Ollama).
type OpenAIProvider struct {
	client *http.Client
}

// NewOpenAIProvider creates an OpenAI compatible provider instance.
func NewOpenAIProvider(client *http.Client) *OpenAIProvider {
	if client == nil {
		client = SharedDefaultHTTPClient
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

// buildCompletionURL joins base URL with /completions cleanly.
func buildCompletionURL(baseURL string) string {
	baseURL = strings.TrimRight(baseURL, "/")
	if strings.HasSuffix(baseURL, "/completions") {
		return baseURL
	}
	return baseURL + "/completions"
}

func messagesToPrompt(msgs []model.ChatMessage) string {
	var sb strings.Builder
	for _, m := range msgs {
		role := strings.ToLower(m.Role)
		content := m.GetContentString()
		if role == "system" {
			sb.WriteString("Instruction: " + content + "\n\n")
		} else if role == "user" {
			sb.WriteString("Human: " + content + "\n\n")
		} else if role == "assistant" {
			sb.WriteString("Assistant: " + content + "\n\n")
		} else {
			sb.WriteString(m.Role + ": " + content + "\n\n")
		}
	}
	sb.WriteString("Assistant: ")
	return sb.String()
}

// ChatComplete executes a non-streaming chat request, automatically performing protocol adaptation
// if the downstream channel only supports legacy text completion.
func (p *OpenAIProvider) ChatComplete(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (*model.ChatCompletionResponse, error) {
	targetModel := channel.GetUpstreamModel(req.Model)

	// Automatic protocol translation: if downstream only supports /v1/completions
	if channel.IsPureTextCompletion() {
		textReq := model.TextCompletionRequest{
			Model:       targetModel,
			Prompt:      messagesToPrompt(req.Messages),
			MaxTokens:   req.MaxTokens,
			Temperature: req.Temperature,
			TopP:        req.TopP,
			Stream:      false,
		}
		payloadBytes, err := json.Marshal(textReq)
		if err != nil {
			return nil, fmt.Errorf("marshal text request error: %w", err)
		}

		targetURL := buildCompletionURL(channel.BaseURL)
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

		var textResp model.TextCompletionResponse
		if err := json.Unmarshal(bodyBytes, &textResp); err != nil {
			return nil, fmt.Errorf("unmarshal text completion response error: %w", err)
		}

		content := ""
		var finishReason *string
		if len(textResp.Choices) > 0 {
			content = textResp.Choices[0].Text
			finishReason = textResp.Choices[0].FinishReason
		}

		return &model.ChatCompletionResponse{
			ID:      textResp.ID,
			Object:  "chat.completion",
			Created: textResp.Created,
			Model:   req.Model,
			Choices: []model.ChatCompletionChoice{
				{
					Index: 0,
					Message: model.ChatMessage{
						Role:    "assistant",
						Content: content,
					},
					FinishReason: finishReason,
				},
			},
			Usage: textResp.Usage,
		}, nil
	}

	// Standard chat completion
	clonedReq := *req
	clonedReq.Model = targetModel
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

// ChatCompleteStream executes a streaming chat request, automatically performing protocol adaptation
// if the downstream channel only supports legacy text completion.
func (p *OpenAIProvider) ChatCompleteStream(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (<-chan *model.StreamEvent, error) {
	targetModel := channel.GetUpstreamModel(req.Model)
	isPureText := channel.IsPureTextCompletion()

	var payloadBytes []byte
	var targetURL string
	var err error

	if isPureText {
		textReq := model.TextCompletionRequest{
			Model:       targetModel,
			Prompt:      messagesToPrompt(req.Messages),
			MaxTokens:   req.MaxTokens,
			Temperature: req.Temperature,
			TopP:        req.TopP,
			Stream:      true,
		}
		payloadBytes, err = json.Marshal(textReq)
		if err != nil {
			return nil, fmt.Errorf("marshal text stream request error: %w", err)
		}
		targetURL = buildCompletionURL(channel.BaseURL)
	} else {
		clonedReq := *req
		clonedReq.Model = targetModel
		clonedReq.Stream = true

		payloadBytes, err = json.Marshal(clonedReq)
		if err != nil {
			return nil, fmt.Errorf("marshal request error: %w", err)
		}
		targetURL = buildURL(channel.BaseURL)
	}

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

			if isPureText {
				var textChunk struct {
					ID      string `json:"id"`
					Created int64  `json:"created"`
					Choices []struct {
						Text         string  `json:"text"`
						FinishReason *string `json:"finish_reason"`
					} `json:"choices"`
				}
				if err := json.Unmarshal([]byte(dataContent), &textChunk); err == nil && len(textChunk.Choices) > 0 {
					cChunk := model.ChatCompletionChunk{
						ID:      textChunk.ID,
						Object:  "chat.completion.chunk",
						Created: textChunk.Created,
						Model:   req.Model,
						Choices: []model.ChunkChoice{
							{
								Index: 0,
								Delta: model.ChunkDelta{
									Content: textChunk.Choices[0].Text,
								},
								FinishReason: textChunk.Choices[0].FinishReason,
							},
						},
					}
					eventChan <- &model.StreamEvent{
						Chunk: &cChunk,
						Raw:   line,
					}
					continue
				}
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
