package main

import (
	"context"
	"crypto/ed25519"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
)

func testReplica(t *testing.T, codec snapshotCodec) {
	t.Helper()
	snapshot := replicaSnapshot{
		Format: 1, CompanyID: "test-company",
		Tables: []replicaTable{
			{"Company", []string{`{"id": "test-company", "name": "Тестовая СТО"}`}},
			{"Client", []string{`{"id": "client-1", "name": "Иванов"}`}},
			{"Vehicle", []string{`{"id": "vehicle-1", "make": "Jetour", "model": "X70", "plate": "А123АА", "vin": "VIN123"}`}},
			{"WorkOrder", []string{`{"id": "order-1", "numberPrefix": "А", "number": 42, "clientId": "client-1", "vehicleId": "vehicle-1", "status": "DRAFT", "acceptedAt": "2026-11-25T12:00:00"}`}},
			{"WorkOrderWork", []string{`{"orderId": "order-1", "name": "Диагностика", "normHours": 0.50, "price": 250000}`}},
			{"WorkOrderItem", []string{`{"orderId": "order-1", "name": "Фильтр", "article": "A1", "qty": 1.000, "price": 80099}`}},
		},
	}
	digest, err := snapshot.checksum()
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Digest = digest
	directory := t.TempDir()
	key, err := loadOrCreateKey(directory)
	if err != nil {
		t.Fatal(err)
	}
	code := strings.Repeat("A", 32)
	confirmed := make(chan bool, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var input replicaRequest
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.Code != code {
			http.Error(w, "invalid code", http.StatusBadRequest)
			return
		}
		encoded, _ := base64.RawURLEncoding.DecodeString(input.PublicKey)
		signature, _ := base64.RawURLEncoding.DecodeString(input.Signature)
		expectedKey, _ := x509.MarshalPKIXPublicKey(key.Public())
		purpose, digestJSON := "snapshot", "null"
		if input.Digest != nil {
			purpose, digestJSON = "confirm", fmt.Sprintf("%q", *input.Digest)
		}
		message := fmt.Sprintf(`["autoremhubsto/desktop-replica/v1",%q,%q,%d,%s]`, purpose, code, input.At, digestJSON)
		if string(encoded) != string(expectedKey) || !ed25519.Verify(key.Public().(ed25519.PublicKey), []byte(message), signature) {
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}
		if input.Digest == nil {
			_ = json.NewEncoder(w).Encode(snapshot)
			return
		}
		if *input.Digest != digest {
			http.Error(w, "invalid digest", http.StatusConflict)
			return
		}
		confirmed <- true
		_ = json.NewEncoder(w).Encode(map[string]string{"digest": digest, "verifiedAt": "2026-11-25T12:00:00Z"})
	}))
	if err := downloadReplica(context.Background(), server.URL, directory, code, codec); err != nil {
		server.Close()
		t.Fatal(err)
	}
	server.Close()
	select {
	case <-confirmed:
	default:
		t.Fatal("snapshot was not confirmed")
	}

	// Read the order with the server shut down and a freshly opened database.
	book, err := readLocalOrders(directory, codec)
	if err != nil {
		t.Fatal(err)
	}
	if len(book.Orders) != 1 || book.Company != "Тестовая СТО" {
		t.Fatalf("unexpected local orders: %+v", book)
	}
	details := book.Orders[0].details()
	for _, field := range []string{"ЗН-А42", "Иванов", "А123АА", "Диагностика", "Фильтр", "800,99"} {
		if !strings.Contains(details, field) {
			t.Errorf("missing %q in order details", field)
		}
	}
	if _, err := readKey(filepath.Join(directory, "workstation-key.pem")); err != nil {
		t.Fatal(err)
	}

	// Invalid rows roll back the transaction and preserve the previous snapshot.
	db, err := openReplicaDB(directory)
	if err != nil {
		t.Fatal(err)
	}
	snapshot.Tables[1].Rows[0] = "corrupt value"
	_, restoreErr := db.restore(context.Background(), snapshot, codec)
	db.Close()
	if restoreErr == nil {
		t.Fatal("corrupt snapshot was restored")
	}
	book, err = readLocalOrders(directory, codec)
	if err != nil || len(book.Orders) != 1 {
		t.Fatalf("previous snapshot was not preserved: %v", err)
	}
}

func TestReplicaDownloadAndOfflineRead(t *testing.T) {
	copyData := func(value []byte) ([]byte, error) { return append([]byte(nil), value...), nil }
	testReplica(t, snapshotCodec{protect: copyData, unprotect: copyData})
}
