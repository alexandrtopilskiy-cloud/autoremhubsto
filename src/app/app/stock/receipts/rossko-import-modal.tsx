"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getRosskoOrdersAction, createReceiptFromPartsAction } from "./rossko-actions";
import { type RosskoOrder, type RosskoPart } from "@/lib/services/rossko-types";
import { SelectedRosskoPart } from "@/lib/services/rossko-receipt";

export function RosskoImportModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<RosskoOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [selectedParts, setSelectedParts] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleOpen = async () => {
    setIsOpen(true);
    setLoading(true);
    setError(null);
    setSelectedParts(new Set());
    const res = await getRosskoOrdersAction();
    if (res.success && res.orders) {
      setOrders(res.orders);
    } else {
      setError(res.error || "Ошибка загрузки");
    }
    setLoading(false);
  };

  // Уникальный ключ позиции (orderId + guid)
  const partKey = (orderId: number, guid: string) => `${orderId}_${guid}`;

  const togglePart = (orderId: number, guid: string) => {
    const key = partKey(orderId, guid);
    const next = new Set(selectedParts);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedParts(next);
  };

  const toggleOrder = (order: RosskoOrder, checked: boolean) => {
    const next = new Set(selectedParts);
    order.parts.part.forEach(p => {
      const key = partKey(order.id, p.guid);
      if (checked) next.add(key);
      else next.delete(key);
    });
    setSelectedParts(next);
  };

  const handleCreate = () => {
    // Собираем выбранные позиции с данными о заказе
    const partsToCreate: SelectedRosskoPart[] = [];
    orders.forEach(order => {
      order.parts.part.forEach(part => {
        if (selectedParts.has(partKey(order.id, part.guid))) {
          partsToCreate.push({ ...part, orderId: order.id, orderDate: order.created_date });
        }
      });
    });

    if (partsToCreate.length === 0) return;

    startTransition(async () => {
      const res = await createReceiptFromPartsAction(partsToCreate);
      if (res.success && res.receiptId) {
        setIsOpen(false);
        router.push(`/app/stock/receipts/${res.receiptId}`);
      } else {
        alert(res.error || "Ошибка при создании");
      }
    });
  };

  // Подсчет итоговой суммы
  const totalSum = useMemo(() => {
    let sum = 0;
    orders.forEach(order => {
      order.parts.part.forEach(part => {
        if (selectedParts.has(partKey(order.id, part.guid))) {
          sum += parseFloat(part.price) * part.count;
        }
      });
    });
    return sum;
  }, [selectedParts, orders]);

  return (
    <>
      <button onClick={handleOpen} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
        Получить из Rossko
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-lg font-semibold">Заказы из Rossko</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-800">✕</button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {loading && <p>Загрузка...</p>}
              {error && <p className="text-red-600">{error}</p>}
              {!loading && !error && orders.length === 0 && <p className="text-slate-500">Нет доступных заказов.</p>}
              
              {!loading && orders.length > 0 && (
                <div className="flex flex-col gap-4">
                  {orders.map((o) => {
                    // Проверяем, все ли позиции заказа выбраны
                    const allSelected = o.parts.part.every(p => selectedParts.has(partKey(o.id, p.guid)));
                    
                    return (
                      <div key={o.id} className="border rounded-md overflow-hidden">
                        <div className="bg-slate-50 p-3 flex items-center justify-between border-b">
                          <div className="flex items-center gap-3">
                            <input 
                              type="checkbox" 
                              checked={allSelected}
                              onChange={(e) => toggleOrder(o, e.target.checked)}
                              className="w-4 h-4 cursor-pointer"
                            />
                            <span className="font-semibold">Заказ №{o.id}</span>
                            <span className="text-sm text-slate-500">от {o.created_date}</span>
                          </div>
                          <span className="font-medium">{o.total_price} ₽</span>
                        </div>
                        
                        <table className="w-full text-sm">
                          <thead className="text-left text-slate-500 bg-white">
                            <tr>
                              <th className="p-2 w-10"></th>
                              <th className="p-2">Артикул</th>
                              <th className="p-2">Название</th>
                              <th className="p-2">Бренд</th>
                              <th className="p-2 text-right">Кол-во</th>
                              <th className="p-2 text-right">Цена</th>
                            </tr>
                          </thead>
                          <tbody>
                            {o.parts.part.map((p) => {
                              const isSelected = selectedParts.has(partKey(o.id, p.guid));
                              return (
                                <tr 
                                  key={`${o.id}_${p.guid}_${p.partnumber}`} 
                                  className={`border-t cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                  onClick={() => togglePart(o.id, p.guid)}
                                >
                                  <td className="p-2 text-center">
                                    <input 
                                      type="checkbox" 
                                      checked={isSelected}
                                      onChange={() => {}} // Обрабатываем клик на строке
                                      className="w-4 h-4 cursor-pointer"
                                    />
                                  </td>
                                  <td className="p-2 font-mono">{p.partnumber}</td>
                                  <td className="p-2">{p.name}</td>
                                  <td className="p-2">{p.brand}</td>
                                  <td className="p-2 text-right">{p.count}</td>
                                  <td className="p-2 text-right">{p.price} ₽</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t p-4 flex items-center justify-between bg-slate-50 rounded-b-lg">
              <div className="text-sm">
                Выбрано позиций: <span className="font-bold">{selectedParts.size}</span>
                {totalSum > 0 && (
                  <span className="ml-4">Сумма: <span className="font-bold">{totalSum.toFixed(2)} ₽</span></span>
                )}
              </div>
              <button 
                onClick={handleCreate}
                disabled={isPending || selectedParts.size === 0}
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {isPending ? "Создание..." : "Создать приход"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
