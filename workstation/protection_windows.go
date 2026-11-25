package main

import (
	"errors"
	"runtime"
	"syscall"
	"unsafe"
)

type dataBlob struct {
	size uint32
	data *byte
}

var (
	crypt32            = syscall.NewLazyDLL("crypt32.dll")
	cryptProtectData   = crypt32.NewProc("CryptProtectData")
	cryptUnprotectData = crypt32.NewProc("CryptUnprotectData")
	localFree          = syscall.NewLazyDLL("kernel32.dll").NewProc("LocalFree")
	windowsCodec       = snapshotCodec{
		protect:   func(data []byte) ([]byte, error) { return protectData(cryptProtectData, data) },
		unprotect: func(data []byte) ([]byte, error) { return protectData(cryptUnprotectData, data) },
	}
)

func protectData(proc *syscall.LazyProc, data []byte) ([]byte, error) {
	if len(data) == 0 {
		return nil, errors.New("В локальной базе отсутствуют защищённые данные.")
	}
	input := dataBlob{uint32(len(data)), &data[0]}
	var output dataBlob
	const uiForbidden = 1
	ok, _, _ := proc.Call(uintptr(unsafe.Pointer(&input)), 0, 0, 0, 0, uiForbidden, uintptr(unsafe.Pointer(&output)))
	runtime.KeepAlive(data)
	if ok == 0 {
		return nil, errors.New("Windows не смогла обработать данные в профиле текущего пользователя.")
	}
	defer localFree.Call(uintptr(unsafe.Pointer(output.data)))
	return append([]byte(nil), unsafe.Slice(output.data, output.size)...), nil
}
