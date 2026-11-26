package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

const replicaURL = "https://sto.autoremhub.ru/api/offline/workstation/desktop-replica"
const replicaProtocol = "autoremhubsto/desktop-replica/v1"
const maxReplicaBytes = 256 << 20

type replicaTable struct {
	Table string   `json:"table"`
	Rows  []string `json:"rows"`
}

type replicaSnapshot struct {
	Format    int            `json:"format"`
	CompanyID string         `json:"companyId"`
	Digest    string         `json:"digest"`
	Tables    []replicaTable `json:"tables"`
}

func (snapshot replicaSnapshot) checksum() (string, error) {
	if snapshot.Format != 1 || snapshot.CompanyID == "" {
		return "", errors.New("Формат снимка не поддерживается.")
	}
	hash := sha256.New()
	header, _ := json.Marshal([]any{snapshot.Format, snapshot.CompanyID})
	_, _ = fmt.Fprintln(hash, string(header))
	names := make(map[string]bool, len(snapshot.Tables))
	for _, table := range snapshot.Tables {
		if table.Table == "" || names[table.Table] {
			return "", errors.New("В снимке повторяется или пропущено имя таблицы.")
		}
		names[table.Table] = true
		header, _ = json.Marshal([]any{table.Table, len(table.Rows)})
		_, _ = fmt.Fprintln(hash, string(header))
		for _, row := range table.Rows {
			_, _ = fmt.Fprintln(hash, row)
		}
	}
	for _, required := range []string{"Company", "Client", "Vehicle", "WorkOrder", "WorkOrderWork", "WorkOrderItem"} {
		if !names[required] {
			return "", errors.New("В снимке отсутствуют данные для просмотра заказ-нарядов.")
		}
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

type replicaRequest struct {
	Code      string  `json:"code"`
	At        int64   `json:"at"`
	PublicKey string  `json:"publicKey"`
	Signature string  `json:"signature"`
	Digest    *string `json:"digest,omitempty"`
}

func postReplica(ctx context.Context, endpoint, code string, key ed25519.PrivateKey, digest *string, result any) error {
	public, err := x509.MarshalPKIXPublicKey(key.Public())
	if err != nil {
		return err
	}
	purpose := "snapshot"
	if digest != nil {
		purpose = "confirm"
	}
	at := time.Now().UnixMilli()
	message, err := json.Marshal([]any{replicaProtocol, purpose, code, at, digest})
	if err != nil {
		return err
	}
	encoding := base64.RawURLEncoding
	body, err := json.Marshal(replicaRequest{
		Code: code, At: at, PublicKey: encoding.EncodeToString(public),
		Signature: encoding.EncodeToString(ed25519.Sign(key, message)), Digest: digest,
	})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	client := http.Client{
		Timeout: 4 * time.Minute,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("Не удалось связаться с сервером СТО.")
	}
	defer response.Body.Close()
	switch response.StatusCode {
	case http.StatusOK:
		reader := &io.LimitedReader{R: response.Body, N: maxReplicaBytes + 1}
		decoder := json.NewDecoder(reader)
		if decoder.Decode(result) != nil || decoder.Decode(new(json.RawMessage)) != io.EOF || reader.N <= 0 {
			return errors.New("Ответ сервера повреждён или превышает 256 МБ.")
		}
		return nil
	case http.StatusConflict:
		return errors.New("Данные СТО изменились или сервер переведён в резервный режим. Обновите страницу «Резервный ПК».")
	case http.StatusForbidden:
		return errors.New("Код загрузки истёк, уже использован или выдан для другого ПК.")
	case http.StatusUnauthorized:
		return errors.New("Сервер отклонил подпись. Проверьте дату и время Windows.")
	default:
		return fmt.Errorf("Не удалось получить ответ от сервера СТО (HTTP %d).", response.StatusCode)
	}
}

func workstationDirectory() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", errors.New("Не удалось открыть профиль пользователя Windows.")
	}
	return filepath.Join(home, ".autoremhubsto"), nil
}

func downloadReplica(ctx context.Context, endpoint, directory, code string, codec snapshotCodec) error {
	key, err := readKey(filepath.Join(directory, "workstation-key.pem"))
	if err != nil {
		return errors.New("Сначала привяжите этот ПК к СТО.")
	}
	var snapshot replicaSnapshot
	if err := postReplica(ctx, endpoint, code, key, nil, &snapshot); err != nil {
		return err
	}
	digest, err := snapshot.checksum()
	if err != nil {
		return err
	}
	if digest != snapshot.Digest {
		return errors.New("Контрольная сумма снимка не совпадает.")
	}

	db, err := openReplicaDB(directory)
	if err != nil {
		return err
	}
	defer db.Close()
	meta, err := db.restore(ctx, snapshot, codec)
	if err != nil {
		return err
	}
	var confirmation struct {
		Digest     string    `json:"digest"`
		VerifiedAt time.Time `json:"verifiedAt"`
	}
	if err := postReplica(ctx, endpoint, code, key, &meta.Digest, &confirmation); err != nil {
		return fmt.Errorf("Локальная копия сохранена. Сервер её не подтвердил. %w", err)
	}
	if confirmation.Digest != meta.Digest || confirmation.VerifiedAt.IsZero() {
		return errors.New("Локальная копия сохранена. Ответ сервера о сверке некорректен.")
	}
	return nil
}
