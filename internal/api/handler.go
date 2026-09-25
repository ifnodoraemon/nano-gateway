package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ifnodoraemon/nano-gateway/internal/middleware"
	"github.com/ifnodoraemon/nano-gateway/internal/model"
	"github.com/ifnodoraemon/nano-gateway/internal/router"
	"github.com/ifnodoraemon/nano-gateway/internal/storage"
	"github.com/ifnodoraemon/nano-gateway/internal/telemetry"
)

// Handler processes API endpoints.
type Handler struct {
	dispatcher *router.Dispatcher
}

// NewHandler creates a new API handler.
func NewHandler(dispatcher *router.Dispatcher) *Handler {
	return &Handler{dispatcher: dispatcher}
}

// HandleChatCompletions handles POST /v1/chat/completions.
func (h *Handler) HandleChatCompletions(c *gin.Context) {
	var req model.ChatCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"message": fmt.Sprintf("Invalid JSON request body: %v", err),
				"type":    "invalid_request_error",
				"code":    "invalid_payload",
			},
		})
		return
	}

	if req.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"message": "Missing 'model' field in request body",
				"type":    "invalid_request_error",
				"code":    "missing_model",
			},
		})
		return
	}

	// Validate authorization for requested model
	if !middleware.ValidateModelAllowed(c, req.Model) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": gin.H{
				"message": fmt.Sprintf("Your API key is not permitted to access model '%s'", req.Model),
				"type":    "forbidden",
				"code":    "model_not_allowed",
			},
		})
		return
	}

	telemetry.GlobalMetrics.IncActiveConns()
	defer telemetry.GlobalMetrics.DecActiveConns()

	start := time.Now()

	// Non-streaming execution
	if !req.Stream {
		resp, err := h.dispatcher.Dispatch(c.Request.Context(), &req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error": gin.H{
					"message": err.Error(),
					"type":    "gateway_error",
					"code":    "upstream_failure",
				},
			})
			return
		}
		dur := time.Since(start)
		pTokens := 0
		cTokens := 0
		if resp.Usage != nil {
			pTokens = resp.Usage.PromptTokens
			cTokens = resp.Usage.CompletionTokens
		}
		telemetry.GlobalMetrics.RecordRequest(true, dur, pTokens, cTokens)
		if storage.GlobalAsyncLogger != nil {
			storage.GlobalAsyncLogger.Record(&storage.UsageLogRecord{
				VirtualKey:       c.GetString("virtual_key"),
				TenantID:         c.GetString("tenant_id"),
				Model:            req.Model,
				PromptTokens:     pTokens,
				CompletionTokens: cTokens,
				TotalTokens:      pTokens + cTokens,
				DurationMs:       dur.Milliseconds(),
				StatusCode:       http.StatusOK,
			})
		}
		c.JSON(http.StatusOK, resp)
		return
	}

	// Streaming SSE execution
	streamChan, err := h.dispatcher.DispatchStream(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": gin.H{
				"message": err.Error(),
				"type":    "gateway_error",
				"code":    "upstream_failure",
			},
		})
		return
	}

	// Set SSE HTTP response headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Status(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Streaming unsupported by response writer"})
		return
	}
	flusher.Flush()

	firstTokenRecorded := false
	var ttftDuration time.Duration
	totalPromptTokens := 0
	totalCompTokens := 0

	recordStreamEnd := func() {
		dur := time.Since(start)
		telemetry.GlobalMetrics.RecordRequest(true, dur, totalPromptTokens, totalCompTokens)
		if storage.GlobalAsyncLogger != nil {
			storage.GlobalAsyncLogger.Record(&storage.UsageLogRecord{
				VirtualKey:       c.GetString("virtual_key"),
				TenantID:         c.GetString("tenant_id"),
				Model:            req.Model,
				PromptTokens:     totalPromptTokens,
				CompletionTokens: totalCompTokens,
				TotalTokens:      totalPromptTokens + totalCompTokens,
				DurationMs:       dur.Milliseconds(),
				TTFTMs:           ttftDuration.Milliseconds(),
				StatusCode:       http.StatusOK,
			})
		}
	}

	w := c.Writer
	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, open := <-streamChan:
			if !open {
				fmt.Fprintf(w, "data: [DONE]\n\n")
				flusher.Flush()
				recordStreamEnd()
				return
			}

			if event.Err != nil {
				telemetry.Logger.Error("stream error received mid-flight", "error", event.Err.Error())
				errJSON, _ := json.Marshal(gin.H{
					"error": gin.H{
						"message": event.Err.Error(),
						"type":    "stream_error",
					},
				})
				fmt.Fprintf(w, "data: %s\n\n", errJSON)
				fmt.Fprintf(w, "data: [DONE]\n\n")
				flusher.Flush()
				return
			}

			if event.IsDone {
				fmt.Fprintf(w, "data: [DONE]\n\n")
				flusher.Flush()
				recordStreamEnd()
				return
			}

			if event.Chunk != nil {
				if !firstTokenRecorded && len(event.Chunk.Choices) > 0 {
					delta := event.Chunk.Choices[0].Delta
					if delta.Content != "" || delta.Role != "" {
						ttftDuration = time.Since(start)
						telemetry.GlobalMetrics.RecordTTFT(ttftDuration)
						firstTokenRecorded = true
					}
				}

				if event.Chunk.Usage != nil {
					totalPromptTokens = event.Chunk.Usage.PromptTokens
					totalCompTokens = event.Chunk.Usage.CompletionTokens
				}

				chunkBytes, err := json.Marshal(event.Chunk)
				if err == nil {
					fmt.Fprintf(w, "data: %s\n\n", chunkBytes)
					flusher.Flush()
				}
			} else if len(event.Raw) > 0 {
				w.Write(event.Raw)
				flusher.Flush()
			}
		}
	}
}

// HandleModels handles GET /v1/models.
func (h *Handler) HandleModels(c *gin.Context) {
	models := h.dispatcher.GetAllSupportedModels()
	items := make([]model.ModelItem, 0, len(models))
	now := time.Now().Unix()

	for _, m := range models {
		items = append(items, model.ModelItem{
			ID:      m,
			Object:  "model",
			Created: now,
			OwnedBy: "nano-gateway",
		})
	}

	c.JSON(http.StatusOK, model.ModelListResponse{
		Object: "list",
		Data:   items,
	})
}

// HandleHealth handles GET /health.
func (h *Handler) HandleHealth(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"service":   "nano-gateway",
		"version":   "0.1.0",
		"timestamp": time.Now().Unix(),
	})
}

// HandleMetrics handles GET /metrics.
func (h *Handler) HandleMetrics(c *gin.Context) {
	c.Data(http.StatusOK, "text/plain; version=0.0.4; charset=utf-8", []byte(telemetry.GlobalMetrics.ToPrometheusFormat()))
}

// HandleCompletions handles legacy text completions POST /v1/completions.
func (h *Handler) HandleCompletions(c *gin.Context) {
	var req model.TextCompletionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"message": fmt.Sprintf("Invalid JSON request body: %v", err),
				"type":    "invalid_request_error",
			},
		})
		return
	}

	if req.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": gin.H{
				"message": "Missing 'model' in request",
				"type":    "invalid_request_error",
			},
		})
		return
	}

	if !middleware.ValidateModelAllowed(c, req.Model) {
		c.JSON(http.StatusForbidden, gin.H{
			"error": gin.H{
				"message": fmt.Sprintf("Model '%s' not allowed for this key", req.Model),
				"type":    "permission_error",
			},
		})
		return
	}

	telemetry.GlobalMetrics.IncActiveConns()
	defer telemetry.GlobalMetrics.DecActiveConns()

	start := time.Now()
	promptStr := req.GetPromptString()

	canonicalReq := &model.ChatCompletionRequest{
		Model: req.Model,
		Messages: []model.ChatMessage{
			{Role: "user", Content: promptStr},
		},
		Temperature: req.Temperature,
		TopP:        req.TopP,
		MaxTokens:   req.MaxTokens,
		Stream:      req.Stream,
	}

	// Non-streaming /v1/completions
	if !req.Stream {
		resp, err := h.dispatcher.Dispatch(c.Request.Context(), canonicalReq)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{
				"error": gin.H{
					"message": err.Error(),
					"type":    "gateway_error",
				},
			})
			return
		}

		replyText := ""
		var finishReason *string
		if len(resp.Choices) > 0 {
			replyText = resp.Choices[0].Message.GetContentString()
			finishReason = resp.Choices[0].FinishReason
		}

		textResp := model.TextCompletionResponse{
			ID:      resp.ID,
			Object:  "text_completion",
			Created: resp.Created,
			Model:   req.Model,
			Choices: []model.TextCompletionChoice{
				{
					Text:         replyText,
					Index:        0,
					FinishReason: finishReason,
				},
			},
			Usage: resp.Usage,
		}

		c.JSON(http.StatusOK, textResp)
		return
	}

	// Streaming SSE /v1/completions
	streamChan, err := h.dispatcher.DispatchStream(c.Request.Context(), canonicalReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{
			"error": gin.H{
				"message": err.Error(),
				"type":    "gateway_error",
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

	w := c.Writer
	totalPromptTokens := 0
	totalCompTokens := 0

	for {
		select {
		case <-c.Request.Context().Done():
			return
		case event, open := <-streamChan:
			if !open {
				fmt.Fprintf(w, "data: [DONE]\n\n")
				flusher.Flush()
				dur := time.Since(start)
				telemetry.GlobalMetrics.RecordRequest(true, dur, totalPromptTokens, totalCompTokens)
				return
			}

			if event.Err != nil {
				fmt.Fprintf(w, "data: {\"error\":\"%s\"}\n\n", event.Err.Error())
				fmt.Fprintf(w, "data: [DONE]\n\n")
				flusher.Flush()
				return
			}

			if event.IsDone {
				fmt.Fprintf(w, "data: [DONE]\n\n")
				flusher.Flush()
				dur := time.Since(start)
				telemetry.GlobalMetrics.RecordRequest(true, dur, totalPromptTokens, totalCompTokens)
				return
			}

			if event.Chunk != nil && len(event.Chunk.Choices) > 0 {
				delta := event.Chunk.Choices[0].Delta
				textChunk := gin.H{
					"id":      event.Chunk.ID,
					"object":  "text_completion",
					"created": event.Chunk.Created,
					"model":   req.Model,
					"choices": []gin.H{
						{
							"text":          delta.Content,
							"index":         0,
							"finish_reason": event.Chunk.Choices[0].FinishReason,
						},
					},
				}
				chunkBytes, _ := json.Marshal(textChunk)
				fmt.Fprintf(w, "data: %s\n\n", chunkBytes)
				flusher.Flush()

				if event.Chunk.Usage != nil {
					totalPromptTokens = event.Chunk.Usage.PromptTokens
					totalCompTokens = event.Chunk.Usage.CompletionTokens
				}
			}
		}
	}
}

// HandleAnthropicCountTokens handles POST /v1/messages/count_tokens for Anthropic Claude SDK compatibility.
func (h *Handler) HandleAnthropicCountTokens(c *gin.Context) {
	var req struct {
		Model    string `json:"model"`
		Messages []struct {
			Role    string `json:"role"`
			Content any    `json:"content"`
		} `json:"messages"`
		System any `json:"system,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	chars := 0
	if req.System != nil {
		if s, ok := req.System.(string); ok {
			chars += len(s)
		}
	}
	for _, m := range req.Messages {
		if s, ok := m.Content.(string); ok {
			chars += len(s)
		}
	}
	tokens := chars / 4
	if tokens == 0 {
		tokens = 1
	}

	c.JSON(http.StatusOK, gin.H{
		"input_tokens": tokens,
	})
}


