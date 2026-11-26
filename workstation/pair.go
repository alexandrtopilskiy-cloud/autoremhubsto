package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const pairingURL = "https://sto.autoremhub.ru/api/offline/workstation/pair"

func validCode(code string) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(code)
	return err == nil && len(code) == 32 && len(decoded) == 24
}

func readKey(path string) (ed25519.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	block, _ := pem.Decode(data)
	if block == nil || block.Type != "PRIVATE KEY" {
		return nil, errors.New("неверный формат ключа")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	privateKey, ok := key.(ed25519.PrivateKey)
	if !ok {
		return nil, errors.New("ожидается ключ Ed25519")
	}
	return privateKey, nil
}

func loadOrCreateKey(directory string) (ed25519.PrivateKey, error) {
	if err := os.MkdirAll(directory, 0700); err != nil {
		return nil, err
	}
	path := filepath.Join(directory, "workstation-key.pem")
	key, err := readKey(path)
	if !errors.Is(err, os.ErrNotExist) {
		return key, err
	}

	_, key, err = ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	encoded, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, err
	}
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if errors.Is(err, os.ErrExist) {
		return readKey(path)
	}
	if err != nil {
		return nil, err
	}
	writeErr := pem.Encode(file, &pem.Block{Type: "PRIVATE KEY", Bytes: encoded})
	if err := errors.Join(writeErr, file.Close()); err != nil {
		_ = os.Remove(path)
		return nil, err
	}
	return key, nil
}

type pairingRequest struct {
	Code      string `json:"code"`
	Name      string `json:"name"`
	PublicKey string `json:"publicKey"`
	Signature string `json:"signature"`
}

func pair(ctx context.Context, endpoint, code, name string, key ed25519.PrivateKey) error {
	public, err := x509.MarshalPKIXPublicKey(key.Public())
	if err != nil {
		return err
	}
	// Формат сообщения совпадает с серверной проверкой в offline-reserve.ts.
	message := []byte("autoremhubsto/workstation-pair/v1\n" + code + "\n" + name)
	encoding := base64.RawURLEncoding
	body, err := json.Marshal(pairingRequest{
		Code:      code,
		Name:      name,
		PublicKey: encoding.EncodeToString(public),
		Signature: encoding.EncodeToString(ed25519.Sign(key, message)),
	})
	if err != nil {
		return err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{
		Timeout: 20 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(request)
	if err != nil {
		return errors.New("Нет связи с сервером СТО. Проверьте интернет и статус ПК в кабинете.")
	}
	defer response.Body.Close()

	var result struct {
		Paired bool `json:"paired"`
	}
	decodeErr := json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&result)
	switch response.StatusCode {
	case http.StatusOK:
		if decodeErr == nil && result.Paired {
			return nil
		}
	case http.StatusConflict:
		return errors.New("Код недействителен или уже использован. Проверьте статус ПК в кабинете или получите новый код.")
	case http.StatusBadRequest:
		return errors.New("Сервер отклонил запрос. Проверьте код в кабинете.")
	}
	return fmt.Errorf("Сервер не подтвердил привязку (HTTP %d). Проверьте статус ПК в кабинете.", response.StatusCode)
}

func registerWorkstation(ctx context.Context, code string) (string, error) {
	directory, err := workstationDirectory()
	if err != nil {
		return "", err
	}
	key, err := loadOrCreateKey(directory)
	if err != nil {
		return "", errors.New("Не удалось прочитать или создать ключ в профиле пользователя Windows.")
	}
	name, _ := os.Hostname()
	name = strings.TrimSpace(name)
	if name == "" {
		name = "Рабочий ПК"
	}
	if chars := []rune(name); len(chars) > 40 {
		name = string(chars[:40])
	}
	return name, pair(ctx, pairingURL, code, name, key)
}
