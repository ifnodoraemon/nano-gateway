package storage

import (
	"sync"
	"time"

	"github.com/ifnodoraemon/nano-gateway/internal/telemetry"
)

// AsyncLogger buffers and batches usage log records to prevent blocking the data plane.
type AsyncLogger struct {
	repo       *Repository
	ch         chan *UsageLogRecord
	stopCh     chan struct{}
	wg         sync.WaitGroup
	batchSize  int
	flushTimer time.Duration
}

// GlobalAsyncLogger is the application-wide async logger instance.
var GlobalAsyncLogger *AsyncLogger

// InitAsyncLogger initializes the background async logger worker.
func InitAsyncLogger(repo *Repository, bufferSize, batchSize int, flushInterval time.Duration) *AsyncLogger {
	if bufferSize <= 0 {
		bufferSize = 10000
	}
	if batchSize <= 0 {
		batchSize = 100
	}
	if flushInterval <= 0 {
		flushInterval = 500 * time.Millisecond
	}

	al := &AsyncLogger{
		repo:       repo,
		ch:         make(chan *UsageLogRecord, bufferSize),
		stopCh:     make(chan struct{}),
		batchSize:  batchSize,
		flushTimer: flushInterval,
	}

	GlobalAsyncLogger = al

	al.wg.Add(1)
	go al.worker()

	return al
}

// Record queues a usage log record asynchronously without blocking.
func (al *AsyncLogger) Record(rec *UsageLogRecord) {
	if al == nil || al.ch == nil {
		return
	}
	select {
	case al.ch <- rec:
	default:
		telemetry.Logger.Warn("async usage log buffer full, dropping log record to preserve data plane performance")
	}
}

// Stop gracefully flushes remaining logs and stops the worker.
func (al *AsyncLogger) Stop() {
	if al == nil {
		return
	}
	close(al.stopCh)
	al.wg.Wait()
}

func (al *AsyncLogger) worker() {
	defer al.wg.Done()

	ticker := time.NewTicker(al.flushTimer)
	defer ticker.Stop()

	var batch []*UsageLogRecord

	flush := func() {
		if len(batch) == 0 {
			return
		}
		for _, rec := range batch {
			_ = al.repo.RecordUsageLog(rec)
		}
		batch = batch[:0]
	}

	for {
		select {
		case rec := <-al.ch:
			batch = append(batch, rec)
			if len(batch) >= al.batchSize {
				flush()
			}

		case <-ticker.C:
			flush()

		case <-al.stopCh:
			// Drain remaining in buffer
			for {
				select {
				case rec := <-al.ch:
					batch = append(batch, rec)
				default:
					flush()
					return
				}
			}
		}
	}
}
