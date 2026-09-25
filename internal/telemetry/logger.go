package telemetry

import (
	"log/slog"
	"os"
	"strings"
)

var Logger *slog.Logger

func init() {
	InitLogger("info")
}

// InitLogger initializes the global structured slog logger.
func InitLogger(levelStr string) {
	var level slog.Level
	switch strings.ToLower(levelStr) {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	default:
		level = slog.LevelInfo
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: level,
	})
	Logger = slog.New(handler)
}
