package controlplane

import (
	"fmt"
	"sync"
	"time"

	"github.com/ifnodoraemon/nano-gateway/internal/config"
	"github.com/ifnodoraemon/nano-gateway/internal/router"
	"github.com/ifnodoraemon/nano-gateway/internal/storage"
	"github.com/ifnodoraemon/nano-gateway/internal/telemetry"
)

// Synchronizer synchronizes persistent database state to the in-memory Data Plane.
type Synchronizer struct {
	mu         sync.Mutex
	repo       *storage.Repository
	dispatcher *router.Dispatcher
}

// NewSynchronizer creates a new Synchronizer.
func NewSynchronizer(repo *storage.Repository, dispatcher *router.Dispatcher) *Synchronizer {
	return &Synchronizer{
		repo:       repo,
		dispatcher: dispatcher,
	}
}

// ReloadFromDB pulls active channels and virtual keys from DB and atomically updates the Data Plane.
func (s *Synchronizer) ReloadFromDB() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 1. Sync Channels to Dispatcher
	channels, err := s.repo.ToModelChannels()
	if err != nil {
		return fmt.Errorf("load channels from db error: %w", err)
	}
	s.dispatcher.UpdateChannels(channels)

	// 2. Sync Virtual Keys to Global Config
	keys, err := s.repo.ToModelVirtualKeys()
	if err != nil {
		return fmt.Errorf("load virtual keys from db error: %w", err)
	}

	cfg := config.GetGlobalConfig()
	cfg.VirtualKeys = keys
	config.SetGlobalConfig(cfg)

	telemetry.Logger.Info("hot reloaded data plane memory state from database",
		"active_channels", len(channels),
		"active_keys", len(keys),
	)

	return nil
}

// StartPeriodicSync runs a background worker to periodically reload configuration from DB,
// enabling automatic hot sync across multi-replica HA clusters.
func (s *Synchronizer) StartPeriodicSync(interval time.Duration, stopCh <-chan struct{}) {
	if interval <= 0 {
		interval = 10 * time.Second
	}
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				_ = s.ReloadFromDB()
			case <-stopCh:
				return
			}
		}
	}()
}

