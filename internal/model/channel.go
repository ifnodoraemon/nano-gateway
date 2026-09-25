package model

import "strings"

// ProviderType represents the upstream provider category.
type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderGemini    ProviderType = "gemini"
	ProviderSub2API   ProviderType = "sub2api"
	ProviderGPUStack  ProviderType = "gpustack"
	ProviderCustom    ProviderType = "custom"
	ProviderDeepSeek  ProviderType = "deepseek"
	ProviderVLLM      ProviderType = "vllm"
	ProviderSGLang    ProviderType = "sglang"
	ProviderOllama    ProviderType = "ollama"
)

// ChannelConfig defines an upstream endpoint configuration.
type ChannelConfig struct {
	Name           string            `yaml:"name" json:"name"`
	Type           ProviderType      `yaml:"type" json:"type"`
	BaseURL        string            `yaml:"base_url" json:"base_url"`
	APIKey         string            `yaml:"api_key" json:"api_key"`
	Models         []string          `yaml:"models" json:"models"`                                 // supported models in this channel
	ModelMapping   map[string]string `yaml:"model_mapping,omitempty" json:"model_mapping,omitempty"` // incoming model -> actual upstream model
	Protocols      []string          `yaml:"protocols,omitempty" json:"protocols,omitempty"`         // supported protocols: openai_chat, openai_text, anthropic_messages
	Priority       int               `yaml:"priority" json:"priority"`                             // lower number means higher priority (e.g. 1 is primary, 2 is fallback)
	Weight         int               `yaml:"weight" json:"weight"`                                 // weight for load balancing among same priority
	TimeoutSeconds int               `yaml:"timeout_seconds" json:"timeout_seconds"`
}

// SupportsProtocol checks whether this channel supports the requested inbound/outbound protocol.
// If Protocols is empty, all protocols are supported by default.
func (c *ChannelConfig) SupportsProtocol(proto string) bool {
	if len(c.Protocols) == 0 {
		return true
	}
	for _, p := range c.Protocols {
		if p == "*" || p == proto {
			return true
		}
		if (p == "chat" || p == "openai_chat") && (proto == "chat" || proto == "openai_chat") {
			return true
		}
		if (p == "completion" || p == "openai_text") && (proto == "completion" || proto == "openai_text") {
			return true
		}
		if (p == "messages" || p == "anthropic_messages") && (proto == "messages" || proto == "anthropic_messages") {
			return true
		}
	}
	return false
}

// SupportsModel checks if this channel can service the requested model (supporting cascading models, wildcards, and prefix stripping).
func (c *ChannelConfig) SupportsModel(requestedModel string) bool {
	// 1. Exact match or wildcard in Models list
	for _, m := range c.Models {
		if m == "*" || m == requestedModel {
			return true
		}
		if strings.HasSuffix(m, "/*") {
			prefix := strings.TrimSuffix(m, "/*") + "/"
			if strings.HasPrefix(requestedModel, prefix) {
				return true
			}
		}
	}

	// 2. Exact match or wildcard in ModelMapping
	if c.ModelMapping != nil {
		if _, ok := c.ModelMapping[requestedModel]; ok {
			return true
		}
		for pattern := range c.ModelMapping {
			if strings.HasSuffix(pattern, "/*") {
				prefix := strings.TrimSuffix(pattern, "/*") + "/"
				if strings.HasPrefix(requestedModel, prefix) {
					return true
				}
			}
		}
	}

	// 3. Automatic channel name prefix match: e.g. channel "yy" servicing "yy/xxx/xx"
	chPrefix := c.Name + "/"
	if strings.HasPrefix(requestedModel, chPrefix) {
		remainder := strings.TrimPrefix(requestedModel, chPrefix)
		for _, m := range c.Models {
			if m == "*" || m == remainder {
				return true
			}
		}
	}

	return false
}

// GetUpstreamModel returns the mapped upstream model name if specified, otherwise the requested model.
// Supports cascading models, unlimited slashes, wildcard prefixes (e.g. "yy/*": "*"), and channel prefix stripping.
func (c *ChannelConfig) GetUpstreamModel(requestedModel string) string {
	if c.ModelMapping != nil {
		// 1. Exact match
		if actual, ok := c.ModelMapping[requestedModel]; ok && actual != "" {
			return actual
		}

		// 2. Pattern / Wildcard prefix match: e.g. "yy/*": "*" or "yy/*": "downstream/*"
		for pattern, targetPattern := range c.ModelMapping {
			if strings.HasSuffix(pattern, "/*") {
				prefix := strings.TrimSuffix(pattern, "/*") + "/"
				if strings.HasPrefix(requestedModel, prefix) {
					remainder := strings.TrimPrefix(requestedModel, prefix)
					if targetPattern == "*" || targetPattern == "" {
						return remainder
					}
					if strings.HasSuffix(targetPattern, "/*") {
						targetPrefix := strings.TrimSuffix(targetPattern, "/*") + "/"
						return targetPrefix + remainder
					}
					return targetPattern
				}
			}
		}
	}

	// 3. Automatic channel prefix match: "yy/xxx/xx" -> "xxx/xx"
	chPrefix := c.Name + "/"
	if strings.HasPrefix(requestedModel, chPrefix) {
		remainder := strings.TrimPrefix(requestedModel, chPrefix)
		for _, m := range c.Models {
			if m == "*" || m == remainder {
				return remainder
			}
		}
	}

	return requestedModel
}

// VirtualKeyConfig defines a virtual API key configured on the gateway.
type VirtualKeyConfig struct {
	Key         string   `yaml:"key" json:"key"`                 // e.g. "sk-gw-admin-12345"
	TenantID    string   `yaml:"tenant_id" json:"tenant_id"`
	AllowedModels []string `yaml:"allowed_models" json:"allowed_models"` // empty means all allowed
	RPM         int      `yaml:"rpm" json:"rpm"`                 // Requests per minute limit (0 = unlimited)
	TPM         int      `yaml:"tpm" json:"tpm"`                 // Tokens per minute limit (0 = unlimited)
	Budget      float64  `yaml:"budget" json:"budget"`           // total dollar or token budget
}
