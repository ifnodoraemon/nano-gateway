package model

// ProviderType represents the upstream provider category.
type ProviderType string

const (
	ProviderOpenAI    ProviderType = "openai"
	ProviderAnthropic ProviderType = "anthropic"
	ProviderGemini    ProviderType = "gemini"
	ProviderDeepSeek  ProviderType = "deepseek"
	ProviderVLLM      ProviderType = "vllm"
	ProviderSGLang    ProviderType = "sglang"
	ProviderOllama    ProviderType = "ollama"
)

// ChannelConfig defines an upstream endpoint configuration.
type ChannelConfig struct {
	Name           string       `yaml:"name" json:"name"`
	Type           ProviderType `yaml:"type" json:"type"`
	BaseURL        string       `yaml:"base_url" json:"base_url"`
	APIKey         string       `yaml:"api_key" json:"api_key"`
	Models         []string     `yaml:"models" json:"models"`             // supported models in this channel
	ModelMapping   map[string]string `yaml:"model_mapping" json:"model_mapping"` // incoming model -> actual upstream model
	Priority       int          `yaml:"priority" json:"priority"`         // lower number means higher priority (e.g. 1 is primary, 2 is fallback)
	Weight         int          `yaml:"weight" json:"weight"`             // weight for load balancing among same priority
	TimeoutSeconds int          `yaml:"timeout_seconds" json:"timeout_seconds"`
}

// GetUpstreamModel returns the mapped upstream model name if specified, otherwise the requested model.
func (c *ChannelConfig) GetUpstreamModel(requestedModel string) string {
	if c.ModelMapping != nil {
		if actual, ok := c.ModelMapping[requestedModel]; ok && actual != "" {
			return actual
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
