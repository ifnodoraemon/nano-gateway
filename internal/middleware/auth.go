package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/ifnodoraemon/nano-gateway/internal/config"
	"github.com/ifnodoraemon/nano-gateway/internal/model"
)

const (
	ContextKeyTenant     = "tenant_id"
	ContextKeyVirtualKey = "virtual_key"
)

// AuthMiddleware authenticates incoming requests via Bearer API keys.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		cfg := config.GetGlobalConfig()

		// If no virtual keys configured in system, allow all requests in open dev mode
		if len(cfg.VirtualKeys) == 0 {
			c.Next()
			return
		}

		var rawKey string

		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
				rawKey = strings.TrimSpace(parts[1])
			}
		}

		// Also support Anthropic SDK's x-api-key header
		if rawKey == "" {
			rawKey = strings.TrimSpace(c.GetHeader("x-api-key"))
		}

		if rawKey == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"message": "Missing authentication key. Please provide 'Authorization: Bearer <key>' or 'x-api-key: <key>'",
					"type":    "invalid_request_error",
					"code":    "missing_api_key",
				},
			})
			return
		}
		var matchedKey *model.VirtualKeyConfig
		for _, vk := range cfg.VirtualKeys {
			if vk.Key == rawKey {
				matchedKey = &vk
				break
			}
		}

		if matchedKey == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": gin.H{
					"message": "Incorrect or unauthorized API key provided.",
					"type":    "authentication_error",
					"code":    "invalid_api_key",
				},
			})
			return
		}

		// Save context info
		c.Set(ContextKeyTenant, matchedKey.TenantID)
		c.Set(ContextKeyVirtualKey, matchedKey)
		c.Next()
	}
}

// ValidateModelAllowed checks if the requested model is permitted for this virtual key.
func ValidateModelAllowed(c *gin.Context, requestedModel string) bool {
	vkAny, exists := c.Get(ContextKeyVirtualKey)
	if !exists {
		return true // open mode
	}

	vk, ok := vkAny.(*model.VirtualKeyConfig)
	if !ok || len(vk.AllowedModels) == 0 {
		return true // all models allowed
	}

	for _, m := range vk.AllowedModels {
		if m == requestedModel {
			return true
		}
	}
	return false
}
