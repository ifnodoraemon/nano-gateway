package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ifnodoraemon/nano-gateway/internal/controlplane"
	"github.com/ifnodoraemon/nano-gateway/internal/model"
	"github.com/ifnodoraemon/nano-gateway/internal/provider"
	"github.com/ifnodoraemon/nano-gateway/internal/router"
)

// TestAutoProbe_OpenAIAndGPUStack verifies that the DownstreamProber correctly discovers models and protocols.
func TestAutoProbe_OpenAIAndGPUStack(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/models" || r.URL.Path == "/models" {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Server", "GPUStack/v1.2.0")
			_ = json.NewEncoder(w).Encode(map[string]any{
				"data": []map[string]string{
					{"id": "meta-llama/Llama-3.1-8B-Instruct"},
					{"id": "dall-e-3"},
					{"id": "tts-1"},
					{"id": "whisper-1"},
				},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer mockServer.Close()

	prober := controlplane.NewDownstreamProber(mockServer.Client())
	res, err := prober.Probe(context.Background(), &controlplane.ProbeRequest{
		BaseURL: mockServer.URL,
		APIKey:  "test-key",
	})
	if err != nil {
		t.Fatalf("Probe failed: %v", err)
	}

	if res.Type != model.ProviderGPUStack {
		t.Errorf("expected detected type %s, got %s", model.ProviderGPUStack, res.Type)
	}
	if len(res.Models) != 4 {
		t.Fatalf("expected 4 models, got %d", len(res.Models))
	}

	// Verify inferred protocols include images, tts, stt
	hasImages := false
	hasTTS := false
	hasSTT := false
	for _, p := range res.Protocols {
		if p == "images" {
			hasImages = true
		}
		if p == "audio_speech" {
			hasTTS = true
		}
		if p == "audio_transcription" {
			hasSTT = true
		}
	}
	if !hasImages || !hasTTS || !hasSTT {
		t.Errorf("expected auto-detected protocols to include images, audio_speech, audio_transcription; got %v", res.Protocols)
	}
}

// TestProtocolConversion_ChatToPureTextCompletion tests when downstream ONLY supports /v1/completions.
func TestProtocolConversion_ChatToPureTextCompletion(t *testing.T) {
	// Upstream that ONLY accepts /v1/completions (legacy format)
	mockPureTextServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/completions" {
			var textReq model.TextCompletionRequest
			if err := json.NewDecoder(r.Body).Decode(&textReq); err != nil {
				http.Error(w, err.Error(), http.StatusBadRequest)
				return
			}

			// Ensure prompt was converted from chat messages
			if !bytes.Contains([]byte(textReq.GetPromptString()), []byte("Human: Hello from Chat client")) {
				http.Error(w, "prompt did not contain converted chat message", http.StatusBadRequest)
				return
			}

			if !textReq.Stream {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(model.TextCompletionResponse{
					ID:      "text-resp-1",
					Object:  "text_completion",
					Created: 1700000000,
					Model:   textReq.Model,
					Choices: []model.TextCompletionChoice{
						{
							Text:  "Hello from legacy pure text upstream!",
							Index: 0,
						},
					},
				})
				return
			}

			// Streaming /v1/completions
			w.Header().Set("Content-Type", "text/event-stream")
			flusher := w.(http.Flusher)
			flusher.Flush()

			fmt.Fprintf(w, "data: {\"choices\":[{\"text\":\"Hello \",\"index\":0}]}\n\n")
			flusher.Flush()
			fmt.Fprintf(w, "data: {\"choices\":[{\"text\":\"streaming!\",\"index\":0}]}\n\n")
			flusher.Flush()
			fmt.Fprintf(w, "data: [DONE]\n\n")
			flusher.Flush()
			return
		}

		// If called with /chat/completions, return 404 to verify adaptation works!
		http.NotFound(w, r)
	}))
	defer mockPureTextServer.Close()

	ch := model.ChannelConfig{
		Name:      "legacy-pure-text-channel",
		Type:      model.ProviderOpenAI,
		BaseURL:   mockPureTextServer.URL + "/v1",
		Models:    []string{"text-davinci-003"},
		Protocols: []string{"openai_text"}, // Only supports completion!
		Priority:  1,
		Weight:    10,
	}

	p := provider.NewOpenAIProvider(mockPureTextServer.Client())

	// 1. Non-streaming Chat request -> Adapted to /v1/completions
	chatReq := &model.ChatCompletionRequest{
		Model: "text-davinci-003",
		Messages: []model.ChatMessage{
			{Role: "user", Content: "Hello from Chat client"},
		},
		Stream: false,
	}
	resp, err := p.ChatComplete(context.Background(), chatReq, &ch)
	if err != nil {
		t.Fatalf("ChatComplete with protocol conversion failed: %v", err)
	}
	if len(resp.Choices) == 0 || resp.Choices[0].Message.Content != "Hello from legacy pure text upstream!" {
		t.Errorf("unexpected adapted chat response: %+v", resp)
	}

	// 2. Streaming Chat request -> Adapted to /v1/completions SSE
	chatStreamReq := &model.ChatCompletionRequest{
		Model: "text-davinci-003",
		Messages: []model.ChatMessage{
			{Role: "user", Content: "Hello from Chat client"},
		},
		Stream: true,
	}
	eventChan, err := p.ChatCompleteStream(context.Background(), chatStreamReq, &ch)
	if err != nil {
		t.Fatalf("ChatCompleteStream with protocol conversion failed: %v", err)
	}

	var gathered string
	for ev := range eventChan {
		if ev.Chunk != nil && len(ev.Chunk.Choices) > 0 {
			gathered += ev.Chunk.Choices[0].Delta.Content
		}
	}
	if gathered != "Hello streaming!" {
		t.Errorf("expected gathered stream 'Hello streaming!', got '%s'", gathered)
	}
}

// TestDispatcher_RoutingWithPureTextDownstream tests full end-to-end Dispatcher execution
func TestDispatcher_RoutingWithPureTextDownstream(t *testing.T) {
	mockServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/completions" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(model.TextCompletionResponse{
				ID:      "cmpl-123",
				Object:  "text_completion",
				Model:   "legacy-model",
				Choices: []model.TextCompletionChoice{{Text: "Adapted response"}},
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer mockServer.Close()

	d := router.NewDispatcher([]model.ChannelConfig{
		{
			Name:      "pure-text-downstream",
			Type:      model.ProviderOpenAI,
			BaseURL:   mockServer.URL + "/v1",
			Models:    []string{"legacy-model"},
			Protocols: []string{"openai_text"},
			Priority:  1,
		},
	})

	chatReq := &model.ChatCompletionRequest{
		Model:    "legacy-model",
		Messages: []model.ChatMessage{{Role: "user", Content: "Ping"}},
	}
	resp, err := d.Dispatch(context.Background(), chatReq)
	if err != nil {
		t.Fatalf("Dispatcher failed to route to pure text downstream: %v", err)
	}
	if len(resp.Choices) == 0 || resp.Choices[0].Message.Content != "Adapted response" {
		t.Errorf("expected adapted response, got %+v", resp)
	}
}
