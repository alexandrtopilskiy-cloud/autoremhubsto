"use client";

import { useState } from "react";
import { checkRosskoConnectionAction } from "./actions";

export function CheckConnectionButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; message?: string; error?: string } | null>(null);

  async function handleCheck() {
    setLoading(true);
    setResult(null);
    const res = await checkRosskoConnectionAction();
    setResult(res);
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleCheck}
        disabled={loading}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        {loading ? "Проверка..." : "Проверить подключение"}
      </button>
      
      {result?.error && <span className="text-xs text-red-600">{result.error}</span>}
      {result?.ok && <span className="text-xs text-green-600">✓ {result.message}</span>}
    </div>
  );
}
