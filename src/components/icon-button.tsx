import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

// Иконки кнопок документа (24×24, обводка): подпись к кнопке показывается подсказкой при наведении.
const ICONS = {
  save: (
    <>
      <path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-2z" />
      <path d="M8 3v5h7V3" />
      <rect x="7.5" y="13" width="9" height="6" rx="1" />
    </>
  ),
  saveExit: (
    <>
      <path d="M13 21H6a2 2 0 0 1-2-2V5a1 1 0 0 1 1-2h9l3 3v4" />
      <path d="M8 3v4h5V3" />
      <path d="M15 16h7M19 13l3 3-3 3" />
    </>
  ),
  post: <path d="M5 12.5l4.5 4.5L19 7" strokeWidth={2.2} />,
  unpost: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </>
  ),
  exit: (
    <>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 16l-4-4 4-4M6 12h10" />
    </>
  ),
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  print: (
    <>
      <path d="M7 9V3h10v6" />
      <rect x="3" y="9" width="18" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
};
export type IconName = keyof typeof ICONS;

const TONES = {
  plain: "border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-600",
  primary: "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
  post: "border-green-600 bg-green-600 text-white hover:bg-green-700",
  danger: "border-slate-300 bg-white text-red-600 hover:border-red-500",
};
export type IconTone = keyof typeof TONES;

function Glyph({ icon, small }: { icon: IconName; small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={small ? "h-4 w-4" : "h-5 w-5"}
      aria-hidden
    >
      {ICONS[icon]}
    </svg>
  );
}

function Tip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute top-full left-1/2 z-20 mt-1.5 -translate-x-1/2 rounded bg-slate-800 px-2 py-0.5 text-xs font-normal whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
    </span>
  );
}

const box = (tone: IconTone, small?: boolean) =>
  `group relative grid shrink-0 place-items-center rounded-md border disabled:cursor-not-allowed disabled:opacity-40 ${small ? "h-7 w-7" : "h-9 w-9"} ${TONES[tone]}`;

/** Квадратная кнопка-иконка с подсказкой-названием. */
export function IconButton({
  icon,
  label,
  tone = "plain",
  small,
  ...rest
}: { icon: IconName; label: string; tone?: IconTone; small?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} {...rest} className={box(tone, small)}>
      <Glyph icon={icon} small={small} />
      <Tip label={label} />
    </button>
  );
}

/** То же для ссылки (печать). */
export function IconLink({ icon, label, href, small, newTab }: { icon: IconName; label: string; href: string; small?: boolean; newTab?: boolean }) {
  return (
    <Link href={href} aria-label={label} target={newTab ? "_blank" : undefined} className={box("plain", small)}>
      <Glyph icon={icon} small={small} />
      <Tip label={label} />
    </Link>
  );
}
