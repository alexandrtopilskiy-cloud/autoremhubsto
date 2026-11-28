"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getRecentReceiptsAction, addMultipleItemsFromReceiptAction } from "./receipt-actions";
import { formatDate } from "@/lib/format";

type ReceiptLine = {
  id: string;
  productId: string;
  qty: string;
  cost: number;
  product: { name: string; article: string | null; brand: string | null; unit: string };
};

type Receipt = {
  id: string;
  number: number;
  date: Date;
  supplier: { name: string } | null;
  lines: ReceiptLine[];
}; 

export function AddFromReceiptModal({ orderId }: { orderId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleOpen = async () => {
    setIsOpen(true);
    setLoading(true);
    setSelectedLines(new Set());

    const res = await getRecentReceiptsAction();

    if (res.success && res.receipts) {
      setReceipts(res.receipts as unknown as Receipt[]);
    }

    setLoading(false);
  };

  const toggleLine = (lineId: string) => {
    const next = new Set(selectedLines);

    if (next.has(lineId)) {
        next.delete(lineId);
    } else {
        next.add(lineId);
    }

    setSelectedLines(next);
  };

  const toggleReceipt = (receipt: Receipt, checked: boolean) => {
    const next = new Set(selectedLines);
    receipt.lines.forEach((l) => {
      if (checked) {
        next.add(l.id);
      } else {
        next.delete(l.id);
      }
    });

    setSelectedLines(next);
  };

  const handleAddSelected = () => {
    const itemsToAdd: { productId: string; qty: number; cost: number }[] = [];
    
    receipts.forEach(r => {
      r.lines.forEach((l) => {
        if (selectedLines.has(l.id)) {
          itemsToAdd.push({
            productId: l.productId,
            qty: 1,
            cost: l.cost
          });
        }
      });
    });

    if (itemsToAdd.length === 0) {
        return;
    }

    startTransition(async () => {
      await addMultipleItemsFromReceiptAction(orderId, itemsToAdd);
      router.refresh();
      setIsOpen(false);
    });
  };

  return (
    <>
      <button onClick={handleOpen} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">
        Из прихода
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-lg font-semibold">Добавить из приходной накладной</h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-800">✕</button>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {loading && <p>Загрузка...</p>}
              {!loading && receipts.length === 0 && <p className="text-slate-500">Нет проведенных приходов.</p>}
              
              {!loading && receipts.map((r) => {
                const allSelected = r.lines.every((l) => selectedLines.has(l.id));
                return (
                  <div key={r.id} className="mb-4 border rounded-md overflow-hidden">
                    <div className="bg-slate-50 p-2 border-b font-medium text-sm flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        checked={allSelected}
                        onChange={(e) => toggleReceipt(r, e.target.checked)}
                        className="w-4 h-4 cursor-pointer"
                      />
                      Приход №{r.number} от {formatDate(r.date)} ({r.supplier?.name || "Без поставщика"})
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {r.lines.map((l) => {
                          const isSelected = selectedLines.has(l.id);
                          return (
                            <tr 
                              key={l.id} 
                              className={`border-t cursor-pointer ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                              onClick={() => toggleLine(l.id)}
                            >
                              <td className="p-2 w-10 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => {}}
                                  className="w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="p-2">
                                <div className="font-medium">{l.product.name}</div>
                                <div className="text-xs text-slate-500">
                                  {l.product.brand} {l.product.article}
                                </div>
                              </td>
                              <td className="p-2 text-right">
                                Остаток: {Number(l.qty)} {l.product.unit}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            <div className="border-t p-4 flex items-center justify-between bg-slate-50 rounded-b-lg">
              <div className="text-sm">
                Выбрано позиций: <span className="font-bold">{selectedLines.size}</span>
              </div>
              <button 
                onClick={handleAddSelected}
                disabled={isPending || selectedLines.size === 0}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isPending ? "Добавление..." : "Добавить выбранные"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
