package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

const (
	dialogTitle = "AutoRemHub СТО — привязка ПК"

	idOK     = 1
	idCancel = 2
	idCode   = 101
	idStatus = 102

	wmClose      = 0x0010
	wmInitDialog = 0x0110
	wmCommand    = 0x0111
	wmPairDone   = 0x8001 // WM_APP + 1
	emSetSel     = 0x00B1
	emSetLimit   = 0x00C5

	wsPopup        = 0x80000000
	wsChild        = 0x40000000
	wsVisible      = 0x10000000
	wsCaption      = 0x00C00000
	wsSysMenu      = 0x00080000
	wsTabStop      = 0x00010000
	wsExClientEdge = 0x00000200

	dsSetFont    = 0x00000040
	dsModalFrame = 0x00000080
	dsCenter     = 0x00000800

	classButton = 0x0080
	classEdit   = 0x0081
	classStatic = 0x0082
)

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	dialogBox       = user32.NewProc("DialogBoxIndirectParamW")
	endDialog       = user32.NewProc("EndDialog")
	getDlgItem      = user32.NewProc("GetDlgItem")
	getDlgItemText  = user32.NewProc("GetDlgItemTextW")
	setDlgItemText  = user32.NewProc("SetDlgItemTextW")
	sendDlgItemMsg  = user32.NewProc("SendDlgItemMessageW")
	enableWindow    = user32.NewProc("EnableWindow")
	setFocus        = user32.NewProc("SetFocus")
	postMessage     = user32.NewProc("PostMessageW")
	messageBox      = user32.NewProc("MessageBoxW")
	getModuleHandle = syscall.NewLazyDLL("kernel32.dll").NewProc("GetModuleHandleW")
)

// Шаблон Win32 состоит из WORD и DWORD. Начало каждого элемента выровнено на DWORD.
type dialogTemplate []uint16

func (t *dialogTemplate) dword(value uint32) {
	*t = append(*t, uint16(value), uint16(value>>16))
}

func (t *dialogTemplate) text(value string) {
	*t = append(*t, utf16.Encode([]rune(value))...)
	*t = append(*t, 0)
}

func (t *dialogTemplate) control(style, extendedStyle uint32, x, y, width, height, id, class uint16, label string) {
	if len(*t)%2 != 0 {
		*t = append(*t, 0)
	}
	t.dword(wsChild | wsVisible | style)
	t.dword(extendedStyle)
	*t = append(*t, x, y, width, height, id, 0xFFFF, class)
	t.text(label)
	*t = append(*t, 0) // Дополнительных данных создания нет.
}

func pairingDialogTemplate() dialogTemplate {
	var t dialogTemplate
	t.dword(wsPopup | wsCaption | wsSysMenu | dsModalFrame | dsCenter | dsSetFont)
	t.dword(0)
	t = append(t, 5, 0, 0, 246, 108, 0, 0) // Элементы, размеры, меню, класс.
	t.text(dialogTitle)
	t = append(t, 9)
	t.text("Segoe UI")
	t.control(0, 0, 12, 10, 222, 12, 0xFFFF, classStatic, "Одноразовый код из раздела «Резервный ПК»")
	t.control(wsTabStop|0x0080, wsExClientEdge, 12, 25, 222, 16, idCode, classEdit, "")
	t.control(0, 0, 12, 47, 222, 30, idStatus, classStatic, "Код действует 10 минут.")
	t.control(wsTabStop|0x0001, 0, 93, 82, 80, 16, idOK, classButton, "Привязать ПК")
	t.control(wsTabStop, 0, 179, 82, 55, 16, idCancel, classButton, "Отмена")
	return t
}

func showMessage(window uintptr, message string, icon uintptr) {
	text, _ := syscall.UTF16PtrFromString(message)
	title, _ := syscall.UTF16PtrFromString(dialogTitle)
	messageBox.Call(window, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), icon)
}

func setStatus(window uintptr, message string) {
	text, _ := syscall.UTF16PtrFromString(message)
	setDlgItemText.Call(window, idStatus, uintptr(unsafe.Pointer(text)))
}

func setInputEnabled(window, enabled uintptr) {
	for _, id := range []uintptr{idCode, idOK} {
		control, _, _ := getDlgItem.Call(window, id)
		enableWindow.Call(control, enabled)
	}
}

func focusCode(window uintptr) {
	edit, _, _ := getDlgItem.Call(window, idCode)
	setFocus.Call(edit)
	sendDlgItemMsg.Call(window, idCode, emSetSel, 0, ^uintptr(0))
}

func showPairingDialog(parent uintptr) bool {
	type result struct {
		name string
		err  error
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	complete := make(chan result, 1)
	busy := false

	proc := syscall.NewCallback(func(window, message, wParam, _ uintptr) uintptr {
		switch message {
		case wmInitDialog:
			sendDlgItemMsg.Call(window, idCode, emSetLimit, 128, 0)
			return 1
		case wmClose:
			endDialog.Call(window, idCancel)
			return 1
		case wmCommand:
			switch uint16(wParam) {
			case idCancel:
				endDialog.Call(window, idCancel)
				return 1
			case idOK:
				if busy {
					return 1
				}
				var buffer [129]uint16
				getDlgItemText.Call(window, idCode, uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
				code := strings.TrimSpace(syscall.UTF16ToString(buffer[:]))
				if !validCode(code) {
					setStatus(window, "Вставьте 32-символьный код из кабинета СТО.")
					focusCode(window)
					return 1
				}

				busy = true
				setInputEnabled(window, 0)
				setStatus(window, "Подключаемся к серверу СТО…")
				go func() {
					name, err := registerWorkstation(ctx, code)
					if ctx.Err() == nil {
						complete <- result{name, err}
						postMessage.Call(window, wmPairDone, 0, 0)
					}
				}()
				return 1
			}
		case wmPairDone:
			select {
			case finished := <-complete:
				if finished.err == nil {
					showMessage(window, fmt.Sprintf("ПК «%s» привязан. Статус можно проверить в кабинете СТО.", finished.name), 0x40)
					endDialog.Call(window, idOK)
					return 1
				}
				busy = false
				setStatus(window, finished.err.Error())
				setInputEnabled(window, 1)
				focusCode(window)
			default:
			}
			return 1
		}
		return 0
	})

	template := pairingDialogTemplate()
	instance, _, _ := getModuleHandle.Call(0)
	code, _, _ := dialogBox.Call(instance, uintptr(unsafe.Pointer(&template[0])), parent, proc, 0)
	runtime.KeepAlive(template)
	if code == ^uintptr(0) {
		showMessage(parent, "Не удалось открыть окно привязки ПК.", 0x10)
	}
	return code == idOK
}

func main() {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	directory, err := workstationDirectory()
	if err != nil {
		showMessage(0, err.Error(), 0x10)
		return
	}
	_, err = os.Stat(filepath.Join(directory, "workstation-key.pem"))
	if os.IsNotExist(err) && !showPairingDialog(0) {
		return
	}
	showCabinetDialog(directory)
}
