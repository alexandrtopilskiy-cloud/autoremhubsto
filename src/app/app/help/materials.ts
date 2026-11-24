import type { ComponentType } from "react";
import { OfflineReserveGuide, offlineReserveSections } from "./offline-reserve";

type Material = {
  id: string;
  title: string;
  sections: readonly { id: string; title: string }[];
  Content: ComponentType;
};

export const helpCategories: { title: string; materials: [Material, ...Material[]] }[] = [
  {
    title: "Резервная работа",
    materials: [
      { id: "offline-reserve", title: "Настройка офлайн-резерва", sections: offlineReserveSections, Content: OfflineReserveGuide },
    ],
  },
];
