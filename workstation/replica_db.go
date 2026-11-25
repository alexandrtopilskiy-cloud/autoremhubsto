package main

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	bolt "go.etcd.io/bbolt"
)

type snapshotCodec struct {
	protect   func([]byte) ([]byte, error)
	unprotect func([]byte) ([]byte, error)
}

const replicaFile = "offline.db"

var (
	snapshotBucket = []byte("snapshot-v1")
	metadataKey    = []byte("@metadata")
	errNoReplica   = errors.New("Локального снимка пока нет.")
)

type snapshotMeta struct {
	Format    int
	CompanyID string
	Digest    string
	LoadedAt  time.Time
}

type replicaDB struct{ *bolt.DB }

func openReplicaDB(directory string) (replicaDB, error) {
	db, err := bolt.Open(filepath.Join(directory, replicaFile), 0600, &bolt.Options{Timeout: time.Second})
	if err != nil {
		return replicaDB{}, errors.New("Не удалось открыть локальную базу. Закройте другие окна AutoRemHub-PC и повторите попытку.")
	}
	return replicaDB{db}, nil
}

func (db replicaDB) restore(ctx context.Context, snapshot replicaSnapshot, codec snapshotCodec) (snapshotMeta, error) {
	meta := snapshotMeta{snapshot.Format, snapshot.CompanyID, snapshot.Digest, time.Now()}
	err := db.Update(func(tx *bolt.Tx) error {
		if err := tx.DeleteBucket(snapshotBucket); err != nil && !errors.Is(err, bolt.ErrBucketNotFound) {
			return err
		}
		root, err := tx.CreateBucket(snapshotBucket)
		if err != nil {
			return err
		}
		metaJSON, err := json.Marshal(meta)
		if err != nil {
			return err
		}
		encrypted, err := codec.protect(metaJSON)
		if err != nil {
			return err
		}
		if err := root.Put(metadataKey, encrypted); err != nil {
			return err
		}
		for _, table := range snapshot.Tables {
			bucket, err := root.CreateBucket([]byte(table.Table))
			if err != nil {
				return err
			}
			for index, row := range table.Rows {
				if err := ctx.Err(); err != nil {
					return err
				}
				if len(row) < 2 || row[0] != '{' || !json.Valid([]byte(row)) {
					return fmt.Errorf("Некорректная запись в снимке (%s).", table.Table)
				}
				value, err := codec.protect([]byte(row))
				if err != nil {
					return err
				}
				key := binary.BigEndian.AppendUint64(nil, uint64(index))
				if err := bucket.Put(key, value); err != nil {
					return err
				}
			}
		}

		// Перечитываем записи из базы до фиксации, чтобы откатить повреждённую копию целиком.
		saved, err := readMetadata(root, codec)
		if err != nil {
			return err
		}
		restored := replicaSnapshot{Format: saved.Format, CompanyID: saved.CompanyID}
		for _, table := range snapshot.Tables {
			rows, err := readTable(root, table.Table, codec)
			if err != nil {
				return err
			}
			restored.Tables = append(restored.Tables, replicaTable{Table: table.Table, Rows: rows})
		}
		digest, err := restored.checksum()
		if err != nil {
			return err
		}
		if digest != saved.Digest || digest != snapshot.Digest {
			return errors.New("Контрольная сумма сохранённых данных не совпадает.")
		}
		meta = saved
		return ctx.Err()
	})
	if err != nil {
		return snapshotMeta{}, fmt.Errorf("Не удалось восстановить локальную базу. %w", err)
	}
	return meta, nil
}

func readMetadata(root *bolt.Bucket, codec snapshotCodec) (snapshotMeta, error) {
	var meta snapshotMeta
	if root == nil {
		return meta, errNoReplica
	}
	data, err := codec.unprotect(root.Get(metadataKey))
	if err == nil {
		err = json.Unmarshal(data, &meta)
	}
	return meta, err
}

func readTable(root *bolt.Bucket, table string, codec snapshotCodec) ([]string, error) {
	bucket := root.Bucket([]byte(table))
	if bucket == nil {
		return nil, fmt.Errorf("В локальной базе отсутствует таблица %s.", table)
	}
	var rows []string
	err := bucket.ForEach(func(_, value []byte) error {
		data, err := codec.unprotect(value)
		if err != nil {
			return err
		}
		rows = append(rows, string(data))
		return nil
	})
	return rows, err
}

func readLocalOrders(directory string, codec snapshotCodec) (orderBook, error) {
	var book orderBook
	_, err := os.Stat(filepath.Join(directory, replicaFile))
	if errors.Is(err, os.ErrNotExist) {
		return book, errNoReplica
	}
	if err != nil {
		return book, err
	}
	db, err := openReplicaDB(directory)
	if err != nil {
		return book, err
	}
	defer db.Close()
	err = db.View(func(tx *bolt.Tx) error {
		root := tx.Bucket(snapshotBucket)
		meta, err := readMetadata(root, codec)
		if err != nil {
			return err
		}
		book.LoadedAt = meta.LoadedAt
		load := func(table string) ([]string, error) { return readTable(root, table, codec) }
		return book.load(load)
	})
	return book, err
}
