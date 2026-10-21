import type { MenuIcon } from "@/lib/nav";

// Простые контурные значки меню, 20×20.
const paths: Record<MenuIcon | "search" | "user" | "logout" | "collapse" | "burger" | "close", string> = {
  service: "M14.5 3.5a3.5 3.5 0 0 0-3.4 4.4L4 15l1 1 7.1-7.1a3.5 3.5 0 0 0 4.4-3.4l-2 2-2-2 2-2Z M4 4l3 3",
  schedule: "M4 5h12v11H4z M4 8.5h12 M7 3v3 M13 3v3 M7 11.5h2 M11 11.5h2 M7 14h2",
  clients: "M7.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z M3 16c0-2.5 2-4.5 4.5-4.5S12 13.5 12 16 M13 4.5a2.5 2.5 0 0 1 0 4.5 M14.5 11.8c1.5.6 2.5 2.2 2.5 4.2",
  stock: "M3 8l7-4 7 4v8H3z M6 16v-5h8v5 M6 13.5h8",
  money: "M3 6h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3z M3 6l9-2.5V6 M13 11h2",
  reports: "M4 16V10 M8 16V6 M12 16v-4 M16 16V4 M3 16.5h14",
  catalog: "M3 4.5c2.5-.8 4.8-.5 7 1 2.2-1.5 4.5-1.8 7-1v11c-2.5-.8-4.8-.5-7 1-2.2-1.5-4.5-1.8-7-1z M10 5.5v11",
  manage: "M4 4h12v12H4z M4 8h12 M7 11h6 M7 13.5h4",
  search: "M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M13.5 13.5 17 17",
  user: "M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M4 17c0-3.3 2.7-5 6-5s6 1.7 6 5",
  logout: "M8 4H4v12h4 M12 6.5 15.5 10 12 13.5 M15.5 10H8",
  collapse: "M11 5 6 10l5 5 M15 5l-5 5 5 5",
  burger: "M3 5.5h14 M3 10h14 M3 14.5h14",
  close: "M5 5l10 10 M15 5 5 15",
};

export function Icon({ name, className = "h-5 w-5" }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={paths[name]} />
    </svg>
  );
}
