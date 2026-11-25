package main

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"strings"
	"syscall"
	"unsafe"
)

const (
	idDownload = 201
	idPair     = 202
	idOrders   = 203
	idDetails  = 204
	idSearch   = 205
	idSummary  = 206

	wmCabinetDone = 0x8002
	classListbox  = 0x0083
	wsVScroll     = 0x00200000
	lbAddString   = 0x0180
	lbReset       = 0x0184
	lbSetCurSel   = 0x0186
	lbGetCurSel   = 0x0188
)

func cabinetDialogTemplate() dialogTemplate {
	var t dialogTemplate
	t.dword(wsPopup | wsCaption | wsSysMenu | dsModalFrame | dsCenter | dsSetFont)
	t.dword(0)
	t = append(t, 9, 0, 0, 410, 323, 0, 0)
	t.text("AutoRemHub СТО — офлайн-кабинет")
	t = append(t, 9)
	t.text("Segoe UI")
	t.control(0, 0, 10, 10, 175, 12, 0xFFFF, classStatic, "Код загрузки с сайта")
	t.control(wsTabStop|0x0080, wsExClientEdge, 10, 24, 172, 15, idCode, classEdit, "")
	t.control(wsTabStop, 0, 190, 24, 105, 15, idDownload, classButton, "Загрузить снимок")
	t.control(wsTabStop, 0, 302, 24, 98, 15, idPair, classButton, "Привязать ПК")
	t.control(0, 0, 10, 44, 390, 28, idStatus, classStatic, "")
	t.control(0, 0, 10, 74, 390, 22, idSummary, classStatic, "")
	t.control(wsTabStop|0x0080, wsExClientEdge, 10, 98, 390, 15, idSearch, classEdit, "")
	t.control(wsTabStop|wsVScroll|0x0001|0x0100, wsExClientEdge, 10, 120, 390, 65, idOrders, classListbox, "")
	t.control(wsTabStop|wsVScroll|0x0004|0x0040|0x0800, wsExClientEdge, 10, 190, 390, 123, idDetails, classEdit, "")
	return t
}

func editText(window, id uintptr) string {
	var buffer [257]uint16
	getDlgItemText.Call(window, id, uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
	return strings.TrimSpace(syscall.UTF16ToString(buffer[:]))
}

func setControlText(window, id uintptr, value string) {
	ptr, _ := syscall.UTF16PtrFromString(strings.ReplaceAll(value, "\x00", "�"))
	setDlgItemText.Call(window, id, uintptr(unsafe.Pointer(ptr)))
}

func enableControls(window, enabled uintptr, ids ...uintptr) {
	for _, id := range ids {
		control, _, _ := getDlgItem.Call(window, id)
		enableWindow.Call(control, enabled)
	}
}

func showCabinetDialog(directory string) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	type result struct {
		book      orderBook
		loadErr   error
		updateErr error
		update    bool
	}
	complete := make(chan result, 1)
	var book orderBook
	var matching []int
	busy := false

	showSelected := func(window uintptr) {
		index, _, _ := sendDlgItemMsg.Call(window, idOrders, lbGetCurSel, 0, 0)
		text := ""
		if index < uintptr(len(matching)) {
			text = book.Orders[matching[index]].details()
		}
		text = strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\n", "\r\n")
		setControlText(window, idDetails, text)
		sendDlgItemMsg.Call(window, idDetails, emSetSel, 0, 0)
	}

	refreshList := func(window uintptr) {
		matching = matching[:0]
		sendDlgItemMsg.Call(window, idOrders, lbReset, 0, 0)
		query := strings.ToLower(editText(window, idSearch))
		count := 0
		for index, order := range book.Orders {
			label := order.listLabel()
			if !strings.Contains(strings.ToLower(label+" "+order.VIN), query) {
				continue
			}
			count++
			if len(matching) >= 300 {
				continue
			}
			value, _ := syscall.UTF16PtrFromString(strings.ReplaceAll(label, "\x00", "�"))
			position, _, _ := sendDlgItemMsg.Call(window, idOrders, lbAddString, 0, uintptr(unsafe.Pointer(value)))
			if position == uintptr(len(matching)) {
				matching = append(matching, index)
			}
		}
		summary := "Поиск по номеру, клиенту, госномеру или VIN"
		if !book.LoadedAt.IsZero() {
			summary = fmt.Sprintf("%s · снимок от %s · показано %d из %d\r\n%s",
				book.Company, book.LoadedAt.Local().Format("02.01.2006 15:04"), len(matching), count, summary)
		}
		setControlText(window, idSummary, summary)
		if len(matching) > 0 {
			sendDlgItemMsg.Call(window, idOrders, lbSetCurSel, 0, 0)
		}
		showSelected(window)
	}

	load := func(window uintptr, code string) {
		busy = true
		enableControls(window, 0, idCode, idDownload, idPair)
		if code != "" {
			setStatus(window, "Загружаем и сверяем снимок. Это может занять несколько минут…")
		}
		go func() {
			var finished result
			if code != "" {
				finished.update = true
				finished.updateErr = downloadReplica(ctx, replicaURL, directory, code, windowsCodec)
			}
			if ctx.Err() == nil {
				finished.book, finished.loadErr = readLocalOrders(directory, windowsCodec)
				complete <- finished
				postMessage.Call(window, wmCabinetDone, 0, 0)
			}
		}()
	}

	proc := syscall.NewCallback(func(window, message, wParam, _ uintptr) uintptr {
		switch message {
		case wmInitDialog:
			sendDlgItemMsg.Call(window, idCode, emSetLimit, 128, 0)
			sendDlgItemMsg.Call(window, idSearch, emSetLimit, 256, 0)
			sendDlgItemMsg.Call(window, idDetails, emSetLimit, 4<<20, 0)
			load(window, "")
			return 1
		case wmClose:
			endDialog.Call(window, idCancel)
			return 1
		case wmCommand:
			id, notification := uint16(wParam), uint16(wParam>>16)
			switch id {
			case idCancel:
				endDialog.Call(window, idCancel)
			case idDownload:
				if !busy {
					code := editText(window, idCode)
					if !validCode(code) {
						setStatus(window, "Вставьте 32-символьный код загрузки из раздела «Резервный ПК».")
						focusCode(window)
					} else {
						load(window, code)
					}
				}
			case idPair:
				if !busy {
					showPairingDialog(window)
				}
			case idSearch:
				if notification == 0x0300 { // EN_CHANGE
					refreshList(window)
				}
			case idOrders:
				if notification == 1 { // LBN_SELCHANGE
					showSelected(window)
				}
			default:
				return 0
			}
			return 1
		case wmCabinetDone:
			finished := <-complete
			busy = false
			enableControls(window, 1, idCode, idDownload, idPair)
			if finished.loadErr == nil {
				book = finished.book
			}
			refreshList(window)
			switch {
			case finished.updateErr != nil:
				setStatus(window, finished.updateErr.Error())
			case finished.loadErr != nil:
				if errors.Is(finished.loadErr, errNoReplica) {
					setStatus(window, "Снимка пока нет. Получите код загрузки на сайте СТО.")
				} else {
					setStatus(window, "Не удалось открыть локальный снимок. Загрузите его заново.")
				}
			case finished.update:
				setControlText(window, idCode, "")
				setStatus(window, "Снимок сохранён и подтверждён сервером. Заказ-наряды доступны без интернета.")
			default:
				setStatus(window, "Режим просмотра сохранённых заказ-нарядов.")
			}
			return 1
		}
		return 0
	})
	template := cabinetDialogTemplate()
	instance, _, _ := getModuleHandle.Call(0)
	code, _, _ := dialogBox.Call(instance, uintptr(unsafe.Pointer(&template[0])), 0, proc, 0)
	runtime.KeepAlive(template)
	if code == ^uintptr(0) {
		showMessage(0, "Не удалось открыть офлайн-кабинет.", 0x10)
	}
}
