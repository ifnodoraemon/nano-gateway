package controlplane

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/ifnodoraemon/nano-gateway/internal/model"
	"github.com/ifnodoraemon/nano-gateway/internal/provider"
	"github.com/ifnodoraemon/nano-gateway/internal/router"
	"github.com/ifnodoraemon/nano-gateway/internal/storage"
)

// AdminHandler handles REST endpoints for the Control Plane.
type AdminHandler struct {
	repo       *storage.Repository
	sync       *Synchronizer
	dispatcher *router.Dispatcher
	prober     *DownstreamProber
}

// NewAdminHandler creates an AdminHandler.
func NewAdminHandler(repo *storage.Repository, sync *Synchronizer, dispatcher *router.Dispatcher) *AdminHandler {
	return &AdminHandler{
		repo:       repo,
		sync:       sync,
		dispatcher: dispatcher,
		prober:     NewDownstreamProber(nil),
	}
}

// ProbeChannel handles automated downstream service detection and discovery.
func (h *AdminHandler) ProbeChannel(c *gin.Context) {
	var req ProbeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.prober.Probe(c.Request.Context(), &req)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": result})
}

// ListChannels returns all configured channels.
func (h *AdminHandler) ListChannels(c *gin.Context) {
	channels, err := h.repo.ListChannels()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if h.dispatcher != nil {
		for _, ch := range channels {
			ch.BreakerStatus = h.dispatcher.GetBreakerStatus(ch.Name)
		}
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": channels})
}

// CreateChannel creates a new channel.
func (h *AdminHandler) CreateChannel(c *gin.Context) {
	var rec storage.ChannelRecord
	if err := c.ShouldBindJSON(&rec); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if rec.Name == "" || rec.BaseURL == "" || rec.Type == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name, type, and base_url are required"})
		return
	}

	if err := h.repo.CreateChannel(&rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Trigger hot reload into Data Plane memory
	_ = h.sync.ReloadFromDB()

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": rec, "message": "Channel created and synchronized to memory successfully"})
}

// UpdateChannel updates an existing channel.
func (h *AdminHandler) UpdateChannel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var rec storage.ChannelRecord
	if err := c.ShouldBindJSON(&rec); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	rec.ID = id

	if err := h.repo.UpdateChannel(&rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.sync.ReloadFromDB()

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": rec, "message": "Channel updated successfully"})
}

// DeleteChannel removes a channel.
func (h *AdminHandler) DeleteChannel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.repo.DeleteChannel(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.sync.ReloadFromDB()

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "Channel deleted successfully"})
}

// TestChannel tests the live connectivity of a channel.
func (h *AdminHandler) TestChannel(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	channels, err := h.repo.ListChannels()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var target *storage.ChannelRecord
	for _, ch := range channels {
		if ch.ID == id {
			target = ch
			break
		}
	}

	if target == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}

	testModel := "gpt-3.5-turbo"
	if len(target.Models) > 0 {
		testModel = target.Models[0]
	}

	chCfg := model.ChannelConfig{
		Name:           target.Name,
		Type:           target.Type,
		BaseURL:        target.BaseURL,
		APIKey:         target.APIKey,
		Models:         target.Models,
		ModelMapping:   target.ModelMapping,
		TimeoutSeconds: 15,
	}

	var prov provider.Provider
	switch target.Type {
	case model.ProviderAnthropic:
		prov = provider.NewAnthropicProvider(nil)
	case model.ProviderGemini:
		prov = provider.NewGeminiProvider(nil)
	default:
		prov = provider.NewOpenAIProvider(nil)
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	testReq := &model.ChatCompletionRequest{
		Model: testModel,
		Messages: []model.ChatMessage{
			{Role: "user", Content: "ping"},
		},
	}

	start := time.Now()
	resp, err := prov.ChatComplete(ctx, testReq, &chCfg)
	latencyMs := time.Since(start).Milliseconds()

	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"code":       1,
			"success":    false,
			"latency_ms": latencyMs,
			"error":      err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"code":       0,
		"success":    true,
		"latency_ms": latencyMs,
		"response":   resp.Choices[0].Message.GetContentString(),
	})
}

// ListVirtualKeys returns all virtual keys.
func (h *AdminHandler) ListVirtualKeys(c *gin.Context) {
	keys, err := h.repo.ListVirtualKeys()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": keys})
}

// CreateVirtualKey generates a new virtual API key.
func (h *AdminHandler) CreateVirtualKey(c *gin.Context) {
	var rec storage.VirtualKeyRecord
	if err := c.ShouldBindJSON(&rec); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if rec.Key == "" {
		rec.Key = fmt.Sprintf("sk-gw-%d", time.Now().UnixNano())
	}
	if rec.TenantID == "" {
		rec.TenantID = "default-tenant"
	}

	if err := h.repo.CreateVirtualKey(&rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.sync.ReloadFromDB()

	c.JSON(http.StatusOK, gin.H{"code": 0, "data": rec, "message": "Virtual Key created successfully"})
}

// DeleteVirtualKey removes a virtual key.
func (h *AdminHandler) DeleteVirtualKey(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	if err := h.repo.DeleteVirtualKey(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	_ = h.sync.ReloadFromDB()

	c.JSON(http.StatusOK, gin.H{"code": 0, "message": "Virtual Key deleted successfully"})
}

// GetStatsOverview returns dashboard overview metrics.
func (h *AdminHandler) GetStatsOverview(c *gin.Context) {
	stats, err := h.repo.GetStatsOverview()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": stats})
}

// ListModels returns all configured models.
func (h *AdminHandler) ListModels(c *gin.Context) {
	models := h.dispatcher.GetAllSupportedModels()
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": models})
}

// ListLogs returns recent audit usage logs.
func (h *AdminHandler) ListLogs(c *gin.Context) {
	limitStr := c.DefaultQuery("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	logs, err := h.repo.ListUsageLogs(limit, 0)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if logs == nil {
		logs = make([]*storage.UsageLogRecord, 0)
	}
	c.JSON(http.StatusOK, gin.H{"code": 0, "data": logs})
}
