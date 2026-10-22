"use client";
// Название вкладки документа: страница документа сообщает его каркасу («ЗН-1047 Смирнов»).
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export const TAB_TITLE_EVENT = "ar:tab-title";
/** Последние названия по адресу страницы: вкладка может появиться позже, чем страница сообщила название. */
export const tabTitles = new Map<string, string>();

export function TabTitle({ title }: { title: string }) {
  const pathname = usePathname();
  useEffect(() => {
    tabTitles.set(pathname, title);
    window.dispatchEvent(new CustomEvent(TAB_TITLE_EVENT, { detail: { path: pathname, title } }));
  }, [pathname, title]);
  return null;
}
