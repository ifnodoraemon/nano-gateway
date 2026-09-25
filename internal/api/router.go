package api

import (
	"github.com/gin-gonic/gin"
	"github.com/ifnodoraemon/nano-gateway/internal/controlplane"
	"github.com/ifnodoraemon/nano-gateway/internal/middleware"
	"github.com/ifnodoraemon/nano-gateway/internal/router"
	"github.com/ifnodoraemon/nano-gateway/web"
)

// SetupRouter initializes and configures the Gin engine.
func SetupRouter(dispatcher *router.Dispatcher, adminHandler *controlplane.AdminHandler) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	// Global recovery
	r.Use(gin.Recovery())

	// Mount embedded Web UI
	web.RegisterStaticRoutes(r)

	handler := NewHandler(dispatcher)

	// Public health and observability endpoints
	r.GET("/health", handler.HandleHealth)
	r.GET("/metrics", handler.HandleMetrics)

	// Admin Control Plane APIs
	if adminHandler != nil {
		admin := r.Group("/api/v1/admin")
		{
			admin.GET("/channels", adminHandler.ListChannels)
			admin.POST("/channels", adminHandler.CreateChannel)
			admin.PUT("/channels/:id", adminHandler.UpdateChannel)
			admin.DELETE("/channels/:id", adminHandler.DeleteChannel)
			admin.POST("/channels/:id/test", adminHandler.TestChannel)

			admin.GET("/keys", adminHandler.ListVirtualKeys)
			admin.POST("/keys", adminHandler.CreateVirtualKey)
			admin.DELETE("/keys/:id", adminHandler.DeleteVirtualKey)

			admin.GET("/stats/overview", adminHandler.GetStatsOverview)
			admin.GET("/models", adminHandler.ListModels)
		}
	}

	// OpenAI & Anthropic v1 Data Plane API group
	v1 := r.Group("/v1")
	v1.Use(middleware.AuthMiddleware())
	v1.Use(middleware.RateLimitMiddleware())
	{
		// OpenAI ingress (Chat completions + Text completions + Models)
		v1.POST("/chat/completions", handler.HandleChatCompletions)
		v1.POST("/completions", handler.HandleCompletions)
		v1.GET("/models", handler.HandleModels)

		// Anthropic Claude Messages API ingress
		v1.POST("/messages", handler.HandleAnthropicMessages)

		// Multimodal Ingress (Image, Audio TTS/STT, Video)
		mmHandler := NewMultimodalHandler(dispatcher)
		v1.POST("/images/generations", mmHandler.HandleImageGenerations)
		v1.POST("/audio/speech", mmHandler.HandleAudioSpeech)
		v1.POST("/audio/transcriptions", mmHandler.HandleAudioTranscriptions)
		v1.POST("/videos/generations", mmHandler.HandleVideoGenerations)
		v1.GET("/videos/tasks/:id", mmHandler.HandleVideoTask)
	}

	return r
}
