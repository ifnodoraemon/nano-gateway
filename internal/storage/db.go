package storage

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// DB wraps standard sql.DB connection.
type DB struct {
	*sql.DB
}

// OpenDB opens a SQLite database and initializes schema.
func OpenDB(dataSourceName string) (*DB, error) {
	if dataSourceName == "" {
		dataSourceName = "data/gateway.db"
	}

	// Create directory if not memory db
	if dataSourceName != ":memory:" {
		dir := filepath.Dir(dataSourceName)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("create db directory error: %w", err)
		}
	}

	db, err := sql.Open("sqlite", dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db error: %w", err)
	}

	// Configure connection pool for SQLite with WAL mode for high concurrent throughput
	db.SetMaxOpenConns(1) // SQLite works best with serialized writes
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(time.Hour)

	if dataSourceName != ":memory:" {
		_, _ = db.Exec("PRAGMA journal_mode=WAL;")
		_, _ = db.Exec("PRAGMA synchronous=NORMAL;")
		_, _ = db.Exec("PRAGMA busy_timeout=5000;")
	}

	wrapper := &DB{DB: db}
	if err := wrapper.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate db schema error: %w", err)
	}

	return wrapper, nil
}

// migrate creates required tables if they don't exist.
func (db *DB) migrate() error {
	schema := `
	CREATE TABLE IF NOT EXISTS channels (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT UNIQUE NOT NULL,
		type TEXT NOT NULL,
		base_url TEXT NOT NULL,
		api_key TEXT NOT NULL,
		models TEXT NOT NULL,
		model_mapping TEXT,
		protocols TEXT,
		priority INTEGER DEFAULT 1,
		weight INTEGER DEFAULT 10,
		timeout_seconds INTEGER DEFAULT 60,
		status TEXT DEFAULT 'active',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS virtual_keys (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		key TEXT UNIQUE NOT NULL,
		tenant_id TEXT NOT NULL,
		allowed_models TEXT,
		rpm INTEGER DEFAULT 60,
		tpm INTEGER DEFAULT 100000,
		budget REAL DEFAULT 0,
		used_tokens INTEGER DEFAULT 0,
		status TEXT DEFAULT 'active',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS usage_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		virtual_key TEXT,
		tenant_id TEXT,
		model TEXT,
		channel TEXT,
		prompt_tokens INTEGER DEFAULT 0,
		completion_tokens INTEGER DEFAULT 0,
		total_tokens INTEGER DEFAULT 0,
		duration_ms INTEGER DEFAULT 0,
		ttft_ms INTEGER DEFAULT 0,
		status_code INTEGER DEFAULT 200,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_usage_created ON usage_logs(created_at);
	`
	if err := db.Ping(); err == nil {
		_, _ = db.Exec("ALTER TABLE channels ADD COLUMN protocols TEXT;")
	}
	_, err := db.Exec(schema)
	return err
}
