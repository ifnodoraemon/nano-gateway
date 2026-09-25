package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ifnodoraemon/nano-gateway/internal/middleware"
	"github.com/ifnodoraemon/nano-gateway/internal/model"
	"github.com/ifnodoraemon/nano-gateway/internal/telemetry"
)

// AnthropicInboundMessage represents an inbound message from Claude SDK.
type AnthropicInboundMessage struct {
	Role    string `json:"role"`
	Content any    `json:"content"` // can be string or content blocks
}

// AnthropicInboundRequest represents the incoming payload from Anthropic SDK.
type AnthropicInboundRequest struct {
	Model       string                    `json:"model"`
	Messages    []AnthropicInboundMessage `json:"messages"`
	System      string                    `json:"system,omitempty"`
	MaxTokens   int                       `json:"max_tokens"`
	Temperature *float64                  `json:"temperature,omitempty"`
	TopP        *float64                  `json:"top_p,omitempty"`
	Stream      bool                      `json:"stream,omitempty"`
}

// extractMessageContent extracts string text from an Anthropic message content field.
func extractMessageContent(content any) string {
	if content == nil {
		return ""
	}
	if s, ok := content.(string); ok {
		return s
	}
	if blocks, ok := content.([]any); ok {
		var sb strings.Builder
		for _, b := range blocks {
			if m, ok := b.(map[string]any); ok {
				if m["type"] == "text" {
					if t, ok := m["text"].(string); ok {
						sb.WriteString(t)
					}
				}
			}
		}
		return sb.String()
	}
	b, _ := json.Marshal(content)
	return string(b)
}

// ConvertAnthropicToCanonical converts an Anthropic request to the canonical OpenAI request format.
func ConvertAnthropicToCanonical(req *AnthropicInboundRequest) *model.ChatCompletionRequest {
	var canonicalMsgs []model.ChatMessage

	if req.System != "" {
		canonicalMsgs = append(canonicalMsgs, model.ChatMessage{
			Role:    "system",
			Content: req.System,
		})
	}

	for _, msg := range req.Messages {
		canonicalMsgs = append(canonicalMsgs, model.ChatMessage{
			Role:    msg.Role,
			Content: extractMessageContent(msg.Content),
		})
	}

	maxTokens := req.MaxTokens
	if maxTokens <= 0 {
		maxTokens = 4096
	}

	return &model.ChatCompletionRequest{
		Model:       req.Model,
		Messages:    canonicalMsgs,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		MaxTokens:   &maxTokens,
		Stream:      req.Stream,
	}
}

// HandleAnthropicMessages handles POST /v1/messages for Anthropic SDK clients.
func (h *Handler) HandleAnthropicMessages(c *gin.Context) {
	var req AnthropicInboundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"type": "error",
			"error": gin.H{
				"type":    "invalid_request_error",
				"message": fmt.Sprintf("Failed to parse Anthropic request: %v", err),
			},
		})
		return
	}

	if req.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"type": "error",
			"error": gin.H{
				"type":    "invalid_request_error",
				"message": "model is required",
			},
		})
		return
	}

	if !middleware.ValidateModelAllowed(c, req.Model) {
		c.JSON(http.StatusForbidden, gin.H{
			"type": "error",
			"error": gin.H{
				"type":    "permission_error",
				"message": fmt.Sprintf("Your API key is not permitted to access model '%s'", req.Model),
			},
		})
		return
	}

	telemetry.GlobalMetrics.IncActiveConns()
	defer telemetry.GlobalMetrics.DecActiveConns()

	start := time.Now()
	canonicalReq := ConvertAnthropicToCanonical(&req)

	// Non-streaming response for Anthropic clients
	if !req.Stream {
		resp, err := h.dispatcher.Dispatch(c.Request.Context(), canonicalReq)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"type": "error",
				"error": gin.H{
					"type":    "api_error",
					"message": err.Error(),
				},
			})
			return
		}

		replyText := ""
		if len(resp.Choices) > 0 {
			replyText = resp.Choices[0].Message.GetContentString()
		}

		inputTokens := 0
		outputTokens := 0
		if resp.Usage != nil {
			inputTokens = resp.Usage.PromptTokens
			outputTokens = resp.Usage.CompletionTokens
		}

		anthropicResp := gin.H{
			"id":    fmt.Sprintf("msg_%s", resp.ID),
			"type":  "message",
			"role":  "assistant",
			"model": req.Model,
			"content": []gin.H{
				{
					"type": "text",
					"text": replyText,
				},
			},
			"stop_reason": "end_turn",
			"usage": gin.H{
				"input_tokens":  inputTokens,
				"output_tokens": outputTokens,
			},
		}

		c.JSON(http.StatusOK, anthropicResp)
		return
	}

	// Streaming SSE response for Anthropic clients
	streamChan, err := h.dispatcher.DispatchStream(c.Request.Context(), canonicalReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"type": "error",
			"error": gin.H{
				"type":    "api_error",
				"message": err.Error(),
			},
		})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming unsupported"})
		return
	}
	flusher.Flush()

	msgID := fmt.Sprintf("msg_%d", time.Now().UnixNano())
	firstTokenRecorded := false
	totalPromptTokens := 0
	totalCompTokens := 0

	// 1. Emit event: message_start
	startEvent := gin.H{
		"type": "message_start",
		"message": gin.H{
			"id":           msgID,
			"type":         "message",
			"role":         "assistant",
			"content":      []any{},
			"model":        req.Model,
			"stop_reason":  nil,
			"stop_sequence": nil,
			"usage": gin.H{
				"input_tokens":  totalPromptTokens,
				"output_tokens": 1,
			},
		},
	}
	startBytes, _ := json.Marshal(startEvent)
	fmt.Fprintf(c.Writer, "event: message_start\ndata: %s\n\n", startBytes)

	// 2. Emit event: content_block_start
	blockStart := gin.H{
		"type":  "content_block_start",
		"index": 0,
		"content_block": gin.H{
			"type": "text",
			"text": "",
		},
	}
	blockStartBytes, _ := json.Marshal(blockStart)
	fmt.Fprintf(c.Writer, "event: content_block_start\ndata: %s\n\n", blockStartBytes)
	flusher.Flush()

	w := c.Writer
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, open := <-streamChan:
			if !open {
				// Stream finished
				// Emit content_block_stop
				fmt.Fprintf(w, "event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n")

				// Emit message_delta
				deltaEvent := gin.H{
					"type": "message_delta",
					"delta": gin.H{
						"stop_reason":   "end_turn",
						"stop_sequence": nil,
					},
					"usage": gin.H{
						"output_tokens": totalCompTokens,
					},
				}
				deltaBytes, _ := json.Marshal(deltaEvent)
				fmt.Fprintf(w, "event: message_delta\ndata: %s\n\n", deltaBytes)

				// Emit message_stop
				fmt.Fprintf(w, "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n")
				flusher.Flush()

				dur := time.Since(start)
				telemetry.GlobalMetrics.RecordRequest(true, dur, totalPromptTokens, totalCompTokens)
				return
			}

			if event.Err != nil {
				errBytes, _ := json.Marshal(gin.H{
					"type": "error",
					"error": gin.H{
						"type":    "stream_error",
						"message": event.Err.Error(),
					},
				})
				fmt.Fprintf(w, "event: error\ndata: %s\n\n", errBytes)
				flusher.Flush()
				return
			}

			if event.IsDone {
				continue
			}

			if event.Chunk != nil && len(event.Chunk.Choices) > 0 {
				chunkDelta := event.Chunk.Choices[0].Delta
				if chunkDelta.Content != "" {
					if !firstTokenRecorded {
						telemetry.GlobalMetrics.RecordTTFT(time.Since(start))
						firstTokenRecorded = true
					}
					totalCompTokens++

					blockDelta := gin.H{
						"type":  "content_block_delta",
						"index": 0,
						"delta": gin.H{
							"type": "text_delta",
							"text": chunkDelta.Content,
						},
					}
					deltaBytes, _ := json.Marshal(blockDelta)
					fmt.Fprintf(w, "event: content_block_delta\ndata: %s\n\n", deltaBytes)
					flusher.Flush()
				}

				if event.Chunk.Usage != nil {
					totalPromptTokens = event.Chunk.Usage.PromptTokens
					totalCompTokens = event.Chunk.Usage.CompletionTokens
				}
			}
		}
	}
}
