package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/ifnodoraemon/nano-gateway/internal/model"
)

// ChannelRecord represents the database row for channels.
type ChannelRecord struct {
	ID             int64              `json:"id"`
	Name           string             `json:"name"`
	Type           model.ProviderType `json:"type"`
	BaseURL        string             `json:"base_url"`
	APIKey         string             `json:"api_key"`
	Models         []string           `json:"models"`
	ModelMapping   map[string]string  `json:"model_mapping"`
	Protocols      []string           `json:"protocols,omitempty"`
	Priority       int                `json:"priority"`
	Weight         int                `json:"weight"`
	TimeoutSeconds int                `json:"timeout_seconds"`
	Status         string             `json:"status"` // active, inactive
	BreakerStatus  string             `json:"breaker_status,omitempty"`
	CreatedAt      time.Time          `json:"created_at"`
	UpdatedAt      time.Time          `json:"updated_at"`
}

// VirtualKeyRecord represents the database row for virtual keys.
type VirtualKeyRecord struct {
	ID            int64     `json:"id"`
	Key           string    `json:"key"`
	TenantID      string    `json:"tenant_id"`
	AllowedModels []string  `json:"allowed_models"`
	RPM           int       `json:"rpm"`
	TPM           int       `json:"tpm"`
	Budget        float64   `json:"budget"`
	UsedTokens    int64     `json:"used_tokens"`
	Status        string    `json:"status"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// UsageLogRecord represents an audit log entry.
type UsageLogRecord struct {
	ID               int64     `json:"id"`
	VirtualKey       string    `json:"virtual_key"`
	TenantID         string    `json:"tenant_id"`
	Model            string    `json:"model"`
	Channel          string    `json:"channel"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	TotalTokens      int       `json:"total_tokens"`
	DurationMs       int64     `json:"duration_ms"`
	TTFTMs           int64     `json:"ttft_ms"`
	StatusCode       int       `json:"status_code"`
	CreatedAt        time.Time `json:"created_at"`
}

// StatsOverview aggregates system stats for the dashboard.
type StatsOverview struct {
	TotalRequests    int64   `json:"total_requests"`
	TotalTokens      int64   `json:"total_tokens"`
	PromptTokens     int64   `json:"prompt_tokens"`
	CompletionTokens int64   `json:"completion_tokens"`
	ActiveChannels   int     `json:"active_channels"`
	ActiveKeys       int     `json:"active_keys"`
	AvgTTFTMs        float64 `json:"avg_ttft_ms"`
	AvgDurationMs    float64 `json:"avg_duration_ms"`
}

// Repository manages persistence for channels, keys, and logs.
type Repository struct {
	db *DB
}

// NewRepository creates a new Repository.
func NewRepository(db *DB) *Repository {
	return &Repository{db: db}
}

// ListChannels returns all channels.
func (r *Repository) ListChannels() ([]*ChannelRecord, error) {
	rows, err := r.db.Query(`SELECT id, name, type, base_url, api_key, models, model_mapping, protocols, priority, weight, timeout_seconds, status, created_at, updated_at FROM channels ORDER BY priority ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*ChannelRecord
	for rows.Next() {
		var rec ChannelRecord
		var modelsJSON, mappingJSON, protocolsJSON sql.NullString
		err := rows.Scan(&rec.ID, &rec.Name, &rec.Type, &rec.BaseURL, &rec.APIKey, &modelsJSON, &mappingJSON, &protocolsJSON, &rec.Priority, &rec.Weight, &rec.TimeoutSeconds, &rec.Status, &rec.CreatedAt, &rec.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if modelsJSON.Valid && modelsJSON.String != "" {
			_ = json.Unmarshal([]byte(modelsJSON.String), &rec.Models)
		}
		if mappingJSON.Valid && mappingJSON.String != "" {
			_ = json.Unmarshal([]byte(mappingJSON.String), &rec.ModelMapping)
		}
		if protocolsJSON.Valid && protocolsJSON.String != "" {
			_ = json.Unmarshal([]byte(protocolsJSON.String), &rec.Protocols)
		}
		list = append(list, &rec)
	}
	return list, nil
}

// CreateChannel inserts a new channel.
func (r *Repository) CreateChannel(rec *ChannelRecord) error {
	modelsBytes, _ := json.Marshal(rec.Models)
	mappingBytes, _ := json.Marshal(rec.ModelMapping)
	protocolsBytes, _ := json.Marshal(rec.Protocols)
	if rec.Status == "" {
		rec.Status = "active"
	}
	if rec.Priority == 0 {
		rec.Priority = 1
	}
	if rec.Weight == 0 {
		rec.Weight = 10
	}
	if rec.TimeoutSeconds == 0 {
		rec.TimeoutSeconds = 60
	}

	res, err := r.db.Exec(`INSERT INTO channels (name, type, base_url, api_key, models, model_mapping, protocols, priority, weight, timeout_seconds, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		rec.Name, rec.Type, rec.BaseURL, rec.APIKey, string(modelsBytes), string(mappingBytes), string(protocolsBytes), rec.Priority, rec.Weight, rec.TimeoutSeconds, rec.Status)
	if err != nil {
		return err
	}
	rec.ID, _ = res.LastInsertId()
	return nil
}

// UpdateChannel updates an existing channel.
func (r *Repository) UpdateChannel(rec *ChannelRecord) error {
	modelsBytes, _ := json.Marshal(rec.Models)
	mappingBytes, _ := json.Marshal(rec.ModelMapping)
	protocolsBytes, _ := json.Marshal(rec.Protocols)

	_, err := r.db.Exec(`UPDATE channels SET name=?, type=?, base_url=?, api_key=?, models=?, model_mapping=?, protocols=?, priority=?, weight=?, timeout_seconds=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		rec.Name, rec.Type, rec.BaseURL, rec.APIKey, string(modelsBytes), string(mappingBytes), string(protocolsBytes), rec.Priority, rec.Weight, rec.TimeoutSeconds, rec.Status, rec.ID)
	return err
}

// DeleteChannel deletes a channel by ID.
func (r *Repository) DeleteChannel(id int64) error {
	_, err := r.db.Exec(`DELETE FROM channels WHERE id=?`, id)
	return err
}

// ListVirtualKeys returns all virtual keys.
func (r *Repository) ListVirtualKeys() ([]*VirtualKeyRecord, error) {
	rows, err := r.db.Query(`SELECT id, key, tenant_id, allowed_models, rpm, tpm, budget, used_tokens, status, created_at, updated_at FROM virtual_keys ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*VirtualKeyRecord
	for rows.Next() {
		var rec VirtualKeyRecord
		var allowedJSON string
		err := rows.Scan(&rec.ID, &rec.Key, &rec.TenantID, &allowedJSON, &rec.RPM, &rec.TPM, &rec.Budget, &rec.UsedTokens, &rec.Status, &rec.CreatedAt, &rec.UpdatedAt)
		if err != nil {
			return nil, err
		}
		if allowedJSON != "" {
			_ = json.Unmarshal([]byte(allowedJSON), &rec.AllowedModels)
		}
		list = append(list, &rec)
	}
	return list, nil
}

// CreateVirtualKey inserts a new virtual key.
func (r *Repository) CreateVirtualKey(rec *VirtualKeyRecord) error {
	allowedBytes, _ := json.Marshal(rec.AllowedModels)
	if rec.Status == "" {
		rec.Status = "active"
	}
	if rec.RPM == 0 {
		rec.RPM = 60
	}

	res, err := r.db.Exec(`INSERT INTO virtual_keys (key, tenant_id, allowed_models, rpm, tpm, budget, used_tokens, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
		rec.Key, rec.TenantID, string(allowedBytes), rec.RPM, rec.TPM, rec.Budget, rec.UsedTokens, rec.Status)
	if err != nil {
		return err
	}
	rec.ID, _ = res.LastInsertId()
	return nil
}

// DeleteVirtualKey deletes a key by ID.
func (r *Repository) DeleteVirtualKey(id int64) error {
	_, err := r.db.Exec(`DELETE FROM virtual_keys WHERE id=?`, id)
	return err
}

// RecordUsageLog records an audit log asynchronously.
func (r *Repository) RecordUsageLog(log *UsageLogRecord) error {
	_, err := r.db.Exec(`INSERT INTO usage_logs (virtual_key, tenant_id, model, channel, prompt_tokens, completion_tokens, total_tokens, duration_ms, ttft_ms, status_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		log.VirtualKey, log.TenantID, log.Model, log.Channel, log.PromptTokens, log.CompletionTokens, log.TotalTokens, log.DurationMs, log.TTFTMs, log.StatusCode)
	return err
}

// GetStatsOverview queries summary metrics.
func (r *Repository) GetStatsOverview() (*StatsOverview, error) {
	stats := &StatsOverview{}

	row := r.db.QueryRow(`SELECT COUNT(*), COALESCE(SUM(total_tokens), 0), COALESCE(SUM(prompt_tokens), 0), COALESCE(SUM(completion_tokens), 0), COALESCE(AVG(ttft_ms), 0), COALESCE(AVG(duration_ms), 0) FROM usage_logs`)
	err := row.Scan(&stats.TotalRequests, &stats.TotalTokens, &stats.PromptTokens, &stats.CompletionTokens, &stats.AvgTTFTMs, &stats.AvgDurationMs)
	if err != nil {
		return nil, fmt.Errorf("scan usage stats error: %w", err)
	}

	_ = r.db.QueryRow(`SELECT COUNT(*) FROM channels WHERE status='active'`).Scan(&stats.ActiveChannels)
	_ = r.db.QueryRow(`SELECT COUNT(*) FROM virtual_keys WHERE status='active'`).Scan(&stats.ActiveKeys)

	return stats, nil
}

// ToModelChannels converts database ChannelRecords to Data Plane model.ChannelConfigs.
func (r *Repository) ToModelChannels() ([]model.ChannelConfig, error) {
	records, err := r.ListChannels()
	if err != nil {
		return nil, err
	}
	var res []model.ChannelConfig
	for _, rec := range records {
		if rec.Status != "active" {
			continue
		}
		res = append(res, model.ChannelConfig{
			Name:           rec.Name,
			Type:           rec.Type,
			BaseURL:        rec.BaseURL,
			APIKey:         rec.APIKey,
			Models:         rec.Models,
			ModelMapping:   rec.ModelMapping,
			Protocols:      rec.Protocols,
			Priority:       rec.Priority,
			Weight:         rec.Weight,
			TimeoutSeconds: rec.TimeoutSeconds,
		})
	}
	return res, nil
}

// ToModelVirtualKeys converts database VirtualKeyRecords to Data Plane model.VirtualKeyConfigs.
func (r *Repository) ToModelVirtualKeys() ([]model.VirtualKeyConfig, error) {
	records, err := r.ListVirtualKeys()
	if err != nil {
		return nil, err
	}
	var res []model.VirtualKeyConfig
	for _, rec := range records {
		if rec.Status != "active" {
			continue
		}
		res = append(res, model.VirtualKeyConfig{
			Key:           rec.Key,
			TenantID:      rec.TenantID,
			AllowedModels: rec.AllowedModels,
			RPM:           rec.RPM,
			TPM:           rec.TPM,
			Budget:        rec.Budget,
		})
	}
	return res, nil
}
