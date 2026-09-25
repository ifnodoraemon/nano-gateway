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

// GeminiProvider handles Google's specialized Gemini Developer API & Vertex AI protocols.
type GeminiProvider struct {
	client *http.Client
}

// NewGeminiProvider creates a Gemini provider instance.
func NewGeminiProvider(client *http.Client) *GeminiProvider {
	if client == nil {
		client = &http.Client{
			Timeout: 180 * time.Second,
		}
	}
	return &GeminiProvider{client: client}
}

func (p *GeminiProvider) Name() string {
	return "google-gemini"
}

func (p *GeminiProvider) Type() model.ProviderType {
	return model.ProviderGemini
}

// GeminiPart represents a single part of content (text or multimodal inlineData).
type GeminiPart struct {
	Text       string            `json:"text,omitempty"`
	InlineData *GeminiInlineData `json:"inlineData,omitempty"`
}

type GeminiInlineData struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"` // base64 encoded
}

// GeminiContent represents a role-grouped turn.
type GeminiContent struct {
	Role  string       `json:"role"` // "user" or "model"
	Parts []GeminiPart `json:"parts"`
}

// GeminiSystemInstruction represents the system prompt container.
type GeminiSystemInstruction struct {
	Parts []GeminiPart `json:"parts"`
}

// GeminiGenerationConfig controls temperature, max tokens, etc.
type GeminiGenerationConfig struct {
	Temperature     *float64 `json:"temperature,omitempty"`
	TopP            *float64 `json:"topP,omitempty"`
	MaxOutputTokens *int     `json:"maxOutputTokens,omitempty"`
	StopSequences   []string `json:"stopSequences,omitempty"`
}

// GeminiSafetySetting disables or tunes strictness of safety filters to avoid false positive blocks.
type GeminiSafetySetting struct {
	Category  string `json:"category"`
	Threshold string `json:"threshold"`
}

// GeminiRequest represents the payload for Gemini generateContent.
type GeminiRequest struct {
	Contents          []GeminiContent          `json:"contents"`
	SystemInstruction *GeminiSystemInstruction `json:"systemInstruction,omitempty"`
	GenerationConfig  *GeminiGenerationConfig  `json:"generationConfig,omitempty"`
	SafetySettings    []GeminiSafetySetting    `json:"safetySettings,omitempty"`
}

// GeminiUsageMetadata reports token counts.
type GeminiUsageMetadata struct {
	PromptTokenCount     int `json:"promptTokenCount"`
	CandidatesTokenCount int `json:"candidatesTokenCount"`
	TotalTokenCount      int `json:"totalTokenCount"`
}

// GeminiCandidate represents a candidate generation.
type GeminiCandidate struct {
	Content struct {
		Parts []GeminiPart `json:"parts"`
		Role  string       `json:"role"`
	} `json:"content"`
	FinishReason string `json:"finishReason"`
	Index        int    `json:"index"`
}

// GeminiResponse is the response from generateContent.
type GeminiResponse struct {
	Candidates    []GeminiCandidate    `json:"candidates"`
	UsageMetadata *GeminiUsageMetadata `json:"usageMetadata,omitempty"`
}

// convertOpenAIToGemini translates OpenAI canonical request to Gemini structure.
func convertOpenAIToGemini(req *model.ChatCompletionRequest) *GeminiRequest {
	var contents []GeminiContent
	var systemParts []GeminiPart

	for _, msg := range req.Messages {
		parts := model.ParseMessageContent(msg.Content)
		if len(parts) == 0 {
			continue
		}

		if strings.ToLower(msg.Role) == "system" {
			for _, part := range parts {
				if part.Text != "" {
					systemParts = append(systemParts, GeminiPart{Text: part.Text})
				}
			}
			continue
		}

		// Role mapping: "assistant" -> "model", "user" -> "user"
		role := "user"
		if strings.ToLower(msg.Role) == "assistant" {
			role = "model"
		}

		var geminiParts []GeminiPart
		for _, part := range parts {
			switch part.Type {
			case model.ContentPartText:
				if part.Text != "" {
					geminiParts = append(geminiParts, GeminiPart{Text: part.Text})
				}
			case model.ContentPartImageURL:
				if part.ImageURL != nil && part.ImageURL.URL != "" {
					mime, b64 := model.ParseDataURI(part.ImageURL.URL)
					geminiParts = append(geminiParts, GeminiPart{
						InlineData: &GeminiInlineData{
							MimeType: mime,
							Data:     b64,
						},
					})
				}
			case model.ContentPartInputAudio:
				if part.InputAudio != nil && part.InputAudio.Data != "" {
					mime := "audio/wav"
					if part.InputAudio.Format == "mp3" {
						mime = "audio/mp3"
					}
					geminiParts = append(geminiParts, GeminiPart{
						InlineData: &GeminiInlineData{
							MimeType: mime,
							Data:     part.InputAudio.Data,
						},
					})
				}
			}
		}

		if len(geminiParts) > 0 {
			contents = append(contents, GeminiContent{
				Role:  role,
				Parts: geminiParts,
			})
		}
	}

	geminiReq := &GeminiRequest{
		Contents: contents,
		GenerationConfig: &GeminiGenerationConfig{
			Temperature:     req.Temperature,
			TopP:            req.TopP,
			MaxOutputTokens: req.MaxTokens,
		},
		// Permissive safety settings by default so enterprise and technical code aren't falsely blocked
		SafetySettings: []GeminiSafetySetting{
			{Category: "HARM_CATEGORY_HARASSMENT", Threshold: "BLOCK_NONE"},
			{Category: "HARM_CATEGORY_HATE_SPEECH", Threshold: "BLOCK_NONE"},
			{Category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", Threshold: "BLOCK_NONE"},
			{Category: "HARM_CATEGORY_DANGEROUS_CONTENT", Threshold: "BLOCK_NONE"},
		},
	}

	if len(systemParts) > 0 {
		geminiReq.SystemInstruction = &GeminiSystemInstruction{Parts: systemParts}
	}

	return geminiReq
}

// buildGeminiURL creates Google endpoint URL.
func buildGeminiURL(baseURL, modelName string, stream bool, apiKey string) string {
	if baseURL == "" {
		baseURL = "https://generativelanguage.googleapis.com"
	}
	baseURL = strings.TrimRight(baseURL, "/")

	action := "generateContent"
	if stream {
		action = "streamGenerateContent?alt=sse"
	}

	sep := "?"
	if strings.Contains(action, "?") {
		sep = "&"
	}

	return fmt.Sprintf("%s/v1beta/models/%s:%s%skey=%s", baseURL, modelName, action, sep, apiKey)
}

// ChatComplete executes a non-streaming Gemini call and converts to OpenAI format.
func (p *GeminiProvider) ChatComplete(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (*model.ChatCompletionResponse, error) {
	geminiReq := convertOpenAIToGemini(req)
	payloadBytes, err := json.Marshal(geminiReq)
	if err != nil {
		return nil, fmt.Errorf("marshal gemini request error: %w", err)
	}

	targetModel := channel.GetUpstreamModel(req.Model)
	targetURL := buildGeminiURL(channel.BaseURL, targetModel, false, channel.APIKey)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("create gemini http request error: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", channel.APIKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("do gemini request error: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read gemini response body error: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("upstream gemini %s returned %d: %s", channel.Name, resp.StatusCode, string(bodyBytes))
	}

	var geminiResp GeminiResponse
	if err := json.Unmarshal(bodyBytes, &geminiResp); err != nil {
		return nil, fmt.Errorf("unmarshal gemini response error: %w", err)
	}

	replyText := ""
	finishReason := "stop"
	if len(geminiResp.Candidates) > 0 {
		cand := geminiResp.Candidates[0]
		var sb strings.Builder
		for _, part := range cand.Content.Parts {
			sb.WriteString(part.Text)
		}
		replyText = sb.String()
		if cand.FinishReason == "MAX_TOKENS" {
			finishReason = "length"
		}
	}

	var usage *model.Usage
	if geminiResp.UsageMetadata != nil {
		usage = &model.Usage{
			PromptTokens:     geminiResp.UsageMetadata.PromptTokenCount,
			CompletionTokens: geminiResp.UsageMetadata.CandidatesTokenCount,
			TotalTokens:      geminiResp.UsageMetadata.TotalTokenCount,
		}
	}

	return &model.ChatCompletionResponse{
		ID:      fmt.Sprintf("chatcmpl-gemini-%d", time.Now().Unix()),
		Object:  "chat.completion",
		Created: time.Now().Unix(),
		Model:   req.Model,
		Choices: []model.ChatCompletionChoice{
			{
				Index: 0,
				Message: model.ChatMessage{
					Role:    "assistant",
					Content: replyText,
				},
				FinishReason: &finishReason,
			},
		},
		Usage: usage,
	}, nil
}

// ChatCompleteStream executes a streaming Gemini call and converts SSE events to OpenAI format.
func (p *GeminiProvider) ChatCompleteStream(ctx context.Context, req *model.ChatCompletionRequest, channel *model.ChannelConfig) (<-chan *model.StreamEvent, error) {
	geminiReq := convertOpenAIToGemini(req)
	payloadBytes, err := json.Marshal(geminiReq)
	if err != nil {
		return nil, fmt.Errorf("marshal gemini request error: %w", err)
	}

	targetModel := channel.GetUpstreamModel(req.Model)
	targetURL := buildGeminiURL(channel.BaseURL, targetModel, true, channel.APIKey)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, targetURL, bytes.NewReader(payloadBytes))
	if err != nil {
		return nil, fmt.Errorf("create gemini stream request error: %w", err)
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "text/event-stream")
	httpReq.Header.Set("x-goog-api-key", channel.APIKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("connect to gemini stream error: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("upstream gemini %s returned %d: %s", channel.Name, resp.StatusCode, string(bodyBytes))
	}

	eventChan := make(chan *model.StreamEvent, 64)

	go func() {
		defer resp.Body.Close()
		defer close(eventChan)

		reader := bufio.NewReader(resp.Body)
		msgID := fmt.Sprintf("chatcmpl-gemini-%d", time.Now().UnixNano())
		created := time.Now().Unix()

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

			var geminiChunk GeminiResponse
			if err := json.Unmarshal([]byte(dataContent), &geminiChunk); err != nil {
				continue
			}

			textDelta := ""
			var finishReason *string
			if len(geminiChunk.Candidates) > 0 {
				cand := geminiChunk.Candidates[0]
				for _, part := range cand.Content.Parts {
					textDelta += part.Text
				}
				if cand.FinishReason != "" {
					r := strings.ToLower(cand.FinishReason)
					if r == "max_tokens" {
						r = "length"
					} else {
						r = "stop"
					}
					finishReason = &r
				}
			}

			var usage *model.Usage
			if geminiChunk.UsageMetadata != nil {
				usage = &model.Usage{
					PromptTokens:     geminiChunk.UsageMetadata.PromptTokenCount,
					CompletionTokens: geminiChunk.UsageMetadata.CandidatesTokenCount,
					TotalTokens:      geminiChunk.UsageMetadata.TotalTokenCount,
				}
			}

			chunk := &model.ChatCompletionChunk{
				ID:      msgID,
				Object:  "chat.completion.chunk",
				Created: created,
				Model:   req.Model,
				Choices: []model.ChunkChoice{
					{
						Index: 0,
						Delta: model.ChunkDelta{
							Content: textDelta,
						},
						FinishReason: finishReason,
					},
				},
				Usage: usage,
			}

			eventChan <- &model.StreamEvent{Chunk: chunk}
		}
	}()

	return eventChan, nil
}
