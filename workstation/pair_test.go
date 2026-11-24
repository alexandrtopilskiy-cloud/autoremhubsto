package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLocalKeyIsReused(t *testing.T) {
	directory := t.TempDir()
	first, err := loadOrCreateKey(directory)
	if err != nil {
		t.Fatal(err)
	}
	second, err := loadOrCreateKey(directory)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("existing workstation key changed")
	}
	path := filepath.Join(directory, "workstation-key.pem")
	invalidKey := []byte("invalid key")
	if err := os.WriteFile(path, invalidKey, 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadOrCreateKey(directory); err == nil {
		t.Fatal("expected invalid key error")
	}
	actual, err := os.ReadFile(path)
	if err != nil || !bytes.Equal(actual, invalidKey) {
		t.Fatal("invalid key was overwritten or removed")
	}
}

func TestPairingRequestIncludesPublicKeyAndProof(t *testing.T) {
	key, err := loadOrCreateKey(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	code, name := strings.Repeat("g", 32), "Приёмка"
	if !validCode(code) || validCode(code[:31]) || validCode(code[:31]+"=") {
		t.Fatal("unexpected code validation")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var request pairingRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Error(err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if r.Method != http.MethodPost || r.Header.Get("Content-Type") != "application/json" || r.ContentLength <= 0 ||
			request.Code != code || request.Name != name {
			t.Error("invalid pairing request")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		keyDER, keyErr := base64.RawURLEncoding.DecodeString(request.PublicKey)
		signed, signatureErr := base64.RawURLEncoding.DecodeString(request.Signature)
		public, parseErr := x509.ParsePKIXPublicKey(keyDER)
		publicKey, ok := public.(ed25519.PublicKey)
		proof := []byte("autoremhubsto/workstation-pair/v1\n" + code + "\n" + name)
		if keyErr != nil || signatureErr != nil || parseErr != nil || !ok || !ed25519.Verify(publicKey, proof, signed) {
			t.Error("invalid workstation key or signature")
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if err := json.NewEncoder(w).Encode(map[string]bool{"paired": true}); err != nil {
			t.Error(err)
		}
	}))
	defer server.Close()
	if err := pair(t.Context(), server.URL, code, name, key); err != nil {
		t.Fatal(err)
	}
}
