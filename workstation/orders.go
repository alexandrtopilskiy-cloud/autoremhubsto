package main

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

type localOrder struct {
	ID, NumberPrefix, ClientID, VehicleID string
	Status, Reason, Comment               string
	Number                                int
	Mileage                               *int
	AcceptedAt                            string
	Client, Vehicle, Plate, VIN           string
	Works, Items                          []orderLine
}

type orderLine struct {
	OrderID, Name, Article string
	NormHours, Qty         json.Number
	Price, Position        int
}

type orderBook struct {
	LoadedAt time.Time
	Company  string
	Orders   []localOrder
}

type namedRow struct{ ID, Name string }
type vehicleRow struct{ ID, Make, Model, Plate, VIN string }

func decodeRows[T any](load func(string) ([]string, error), table string) ([]T, error) {
	rows, err := load(table)
	if err != nil {
		return nil, err
	}
	result := make([]T, 0, len(rows))
	for _, row := range rows {
		var value T
		if err := json.Unmarshal([]byte(row), &value); err != nil {
			return nil, fmt.Errorf("Не удалось прочитать таблицу %s из локальной базы.", table)
		}
		result = append(result, value)
	}
	return result, nil
}

func (book *orderBook) load(load func(string) ([]string, error)) error {
	companies, err := decodeRows[namedRow](load, "Company")
	if err != nil {
		return err
	}
	if len(companies) != 1 {
		return fmt.Errorf("В локальной базе ожидаются данные одной СТО.")
	}
	book.Company = companies[0].Name
	clients, err := decodeRows[namedRow](load, "Client")
	if err != nil {
		return err
	}
	clientNames := make(map[string]string, len(clients))
	for _, client := range clients {
		clientNames[client.ID] = client.Name
	}
	vehicles, err := decodeRows[vehicleRow](load, "Vehicle")
	if err != nil {
		return err
	}
	vehicleByID := make(map[string]vehicleRow, len(vehicles))
	for _, vehicle := range vehicles {
		vehicleByID[vehicle.ID] = vehicle
	}
	book.Orders, err = decodeRows[localOrder](load, "WorkOrder")
	if err != nil {
		return err
	}
	works, err := decodeRows[orderLine](load, "WorkOrderWork")
	if err != nil {
		return err
	}
	items, err := decodeRows[orderLine](load, "WorkOrderItem")
	if err != nil {
		return err
	}
	sort.SliceStable(works, func(i, j int) bool { return works[i].Position < works[j].Position })
	sort.SliceStable(items, func(i, j int) bool { return items[i].Position < items[j].Position })
	workByOrder := groupLines(works)
	itemsByOrder := groupLines(items)
	for index := range book.Orders {
		order := &book.Orders[index]
		order.Client = clientNames[order.ClientID]
		vehicle := vehicleByID[order.VehicleID]
		order.Vehicle = strings.TrimSpace(vehicle.Make + " " + vehicle.Model)
		order.Plate, order.VIN = vehicle.Plate, vehicle.VIN
		order.Works, order.Items = workByOrder[order.ID], itemsByOrder[order.ID]
	}
	sort.SliceStable(book.Orders, func(i, j int) bool {
		a, b := book.Orders[i], book.Orders[j]
		if a.AcceptedAt != b.AcceptedAt {
			return a.AcceptedAt > b.AcceptedAt
		}
		return a.Number > b.Number
	})
	return nil
}

func groupLines(lines []orderLine) map[string][]orderLine {
	result := make(map[string][]orderLine)
	for _, line := range lines {
		result[line.OrderID] = append(result[line.OrderID], line)
	}
	return result
}

func (order localOrder) label() string {
	return fmt.Sprintf("ЗН-%s%d", order.NumberPrefix, order.Number)
}

func (order localOrder) listLabel() string {
	return strings.Join([]string{order.label(), order.Client, strings.TrimSpace(order.Vehicle + " " + order.Plate)}, "   ·   ")
}

func (order localOrder) details() string {
	var text strings.Builder
	fmt.Fprintln(&text, "Заказ-наряд", order.label())
	date := order.AcceptedAt
	if len(date) >= 10 {
		date = date[:10]
	}
	fmt.Fprintln(&text, "Дата приёмки:", date)
	statuses := map[string]string{"DRAFT": "Черновик", "POSTED": "Проведён"}
	status := statuses[order.Status]
	if status == "" {
		status = order.Status
	}
	fmt.Fprintln(&text, "Статус:", status)
	fmt.Fprintln(&text, "Клиент:", order.Client)
	if order.Vehicle != "" {
		fmt.Fprintln(&text, "Автомобиль:", order.Vehicle)
	}
	if order.Plate != "" {
		fmt.Fprintln(&text, "Госномер:", order.Plate)
	}
	if order.VIN != "" {
		fmt.Fprintln(&text, "VIN:", order.VIN)
	}
	if order.Mileage != nil {
		fmt.Fprintf(&text, "Пробег: %d км\n", *order.Mileage)
	}
	if order.Reason != "" {
		fmt.Fprintln(&text, "Причина обращения:", order.Reason)
	}
	if order.Comment != "" {
		fmt.Fprintln(&text, "Комментарий:", order.Comment)
	}
	fmt.Fprintln(&text, "\nРаботы")
	for _, work := range order.Works {
		fmt.Fprintf(&text, "• %s  ·  %s н/ч  ·  %s ₽/н/ч\n", work.Name, work.NormHours, rubles(work.Price))
	}
	if len(order.Works) == 0 {
		fmt.Fprintln(&text, "Нет работ")
	}
	fmt.Fprintln(&text, "\nЗапчасти")
	for _, item := range order.Items {
		name := item.Name
		if item.Article != "" {
			name += " (" + item.Article + ")"
		}
		fmt.Fprintf(&text, "• %s  ·  %s шт.  ·  %s ₽/шт.\n", name, item.Qty, rubles(item.Price))
	}
	if len(order.Items) == 0 {
		fmt.Fprintln(&text, "Нет запчастей")
	}
	return text.String()
}

func rubles(kopecks int) string {
	sign := ""
	if kopecks < 0 {
		kopecks = -kopecks
		sign = "-"
	}
	return fmt.Sprintf("%s%d,%02d", sign, kopecks/100, kopecks%100)
}
