// 6.7 Расшифровка VIN без внешних сервисов: проверка формата, страна и марка по коду изготовителя (WMI, первые
// три знака) и модельный год по 10-му знаку. Модель и модификацию по VIN надёжно определяет только платный сервис.

const ALLOWED = /^[A-HJ-NPR-Z0-9]{17}$/;

/** VIN без пробелов и дефисов, заглавными; кириллица похожих букв заменяется латиницей. */
export function normalizeVin(input: string): string {
  const cyr: Record<string, string> = { А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X" };
  return input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/[АВЕКМНОРСТУХ]/g, (c) => cyr[c]);
}

// Коды изготовителей, которые чаще всего встречаются на российских СТО.
const WMI: Record<string, string> = {
  XTA: "LADA",
  XTT: "УАЗ",
  X96: "ГАЗ",
  X9F: "Ford",
  XW8: "Volkswagen",
  XWE: "Kia",
  Z94: "Hyundai",
  Z8N: "Nissan",
  X7L: "Renault",
  X7M: "Hyundai",
  XUF: "Chevrolet",
  XUU: "Chevrolet",
  X4X: "BMW",
  XW7: "Toyota",
  Z6F: "Ford",
  Z8T: "Peugeot",
  XTH: "ГАЗ",
  X89: "КамАЗ",
  XTC: "КамАЗ",
  Y6D: "ЗАЗ",
  XWB: "Daewoo",
  Z9M: "Mercedes-Benz",
  Z0X: "Opel",
  XMC: "Mitsubishi",
  X1M: "ПАЗ",
  KMH: "Hyundai",
  KMF: "Hyundai",
  KNA: "Kia",
  KNE: "Kia",
  KND: "Kia",
  KNM: "Renault Samsung",
  KPT: "SsangYong",
  KL1: "Chevrolet",
  KLA: "Daewoo",
  JTD: "Toyota",
  JTE: "Toyota",
  JTM: "Toyota",
  JTN: "Toyota",
  JTJ: "Lexus",
  JTH: "Lexus",
  JT2: "Toyota",
  JT3: "Toyota",
  JHM: "Honda",
  JHL: "Honda",
  JN1: "Nissan",
  JN8: "Nissan",
  JNK: "Infiniti",
  JMB: "Mitsubishi",
  JA3: "Mitsubishi",
  JA4: "Mitsubishi",
  JMZ: "Mazda",
  JM1: "Mazda",
  JM3: "Mazda",
  JS1: "Suzuki",
  JS2: "Suzuki",
  JSA: "Suzuki",
  JF1: "Subaru",
  JF2: "Subaru",
  WVW: "Volkswagen",
  WV1: "Volkswagen",
  WV2: "Volkswagen",
  WVG: "Volkswagen",
  WAU: "Audi",
  WUA: "Audi",
  WBA: "BMW",
  WBS: "BMW",
  WBY: "BMW",
  WMW: "MINI",
  WDB: "Mercedes-Benz",
  WDD: "Mercedes-Benz",
  WDC: "Mercedes-Benz",
  WDF: "Mercedes-Benz",
  W1K: "Mercedes-Benz",
  W1N: "Mercedes-Benz",
  W1V: "Mercedes-Benz",
  WP0: "Porsche",
  WP1: "Porsche",
  WF0: "Ford",
  W0L: "Opel",
  W0V: "Opel",
  VF1: "Renault",
  VF3: "Peugeot",
  VF7: "Citroën",
  VR3: "Peugeot",
  VSS: "SEAT",
  TMB: "Škoda",
  TMA: "Hyundai",
  YV1: "Volvo",
  YV4: "Volvo",
  SAL: "Land Rover",
  SAJ: "Jaguar",
  SCC: "Lotus",
  ZFA: "Fiat",
  ZAR: "Alfa Romeo",
  ZFF: "Ferrari",
  LVS: "Ford",
  LVV: "Chery",
  LGW: "Haval",
  LB3: "Geely",
  L6T: "Geely",
  LSJ: "MG",
  LFV: "Volkswagen",
  LBV: "BMW",
  LRW: "Tesla",
  LNB: "BAIC",
  LJ1: "JAC",
  LS5: "Changan",
  LDC: "Dongfeng",
  "1FA": "Ford",
  "1FT": "Ford",
  "1FM": "Ford",
  "1G1": "Chevrolet",
  "1GC": "Chevrolet",
  "1C4": "Chrysler",
  "1J4": "Jeep",
  "1HG": "Honda",
  "1N4": "Nissan",
  "2T1": "Toyota",
  "2HG": "Honda",
  "3VW": "Volkswagen",
  "4T1": "Toyota",
  "4S3": "Subaru",
  "5YJ": "Tesla",
  "5UX": "BMW",
  "5N1": "Nissan",
  "9BW": "Volkswagen",
};

// Страна по первым двум знакам: диапазоны второго знака.
const COUNTRIES: [string, string, string][] = [
  ["X", "SW", "Россия"],
  ["X", "3", "Россия"],
  ["X", "4", "Россия"],
  ["X", "7", "Россия"],
  ["X", "8", "Россия"],
  ["X", "9", "Россия"],
  ["X", "0", "Россия"],
  ["X", "1", "Россия"],
  ["Z", "0", "Россия"],
  ["Z", "6", "Россия"],
  ["Z", "8", "Россия"],
  ["Z", "9", "Россия"],
  ["Z", "AR", "Италия"],
  ["Y", "SW", "Швеция"],
  ["Y", "6", "Украина"],
  ["Y", "AE", "Бельгия"],
  ["Y", "FK", "Финляндия"],
  ["W", "AZ", "Германия"],
  ["W", "0", "Германия"],
  ["W", "1", "Германия"],
  ["S", "AM", "Великобритания"],
  ["S", "NT", "Германия"],
  ["T", "AH", "Швейцария"],
  ["T", "JP", "Чехия"],
  ["T", "RV", "Венгрия"],
  ["V", "AE", "Австрия"],
  ["V", "FR", "Франция"],
  ["V", "SW", "Испания"],
  ["J", "", "Япония"],
  ["K", "LR", "Южная Корея"],
  ["K", "PT", "Южная Корея"],
  ["L", "", "Китай"],
  ["1", "", "США"],
  ["4", "", "США"],
  ["5", "", "США"],
  ["2", "", "Канада"],
  ["3", "", "Мексика"],
  ["9", "", "Бразилия"],
];

function country(vin: string): string | undefined {
  const [a, b] = vin;
  for (const [first, range, name] of COUNTRIES) {
    if (a !== first) continue;
    if (range === "") return name;
    if (range.length === 1 ? b === range : b >= range[0] && b <= range[1]) return name;
  }
  return undefined;
}

// 10-й знак — модельный год; коды повторяются каждые 30 лет.
const YEAR_CODES = "ABCDEFGHJKLMNPRSTVWXY123456789";

/** Модельный год по 10-му знаку: самый поздний из возможных, но не позже следующего года. */
export function modelYear(vin: string, now = new Date()): number | undefined {
  const i = YEAR_CODES.indexOf(vin[9]);
  if (i < 0) return undefined;
  const max = now.getUTCFullYear() + 1;
  let y = 1980 + i;
  while (y + 30 <= max) y += 30;
  return y;
}

const VALUES: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/** Контрольный знак (9-й) — обязателен для автомобилей Северной Америки. */
export function checkDigitOk(vin: string): boolean {
  const sum = [...vin].reduce((s, c, i) => s + (/\d/.test(c) ? Number(c) : VALUES[c]) * WEIGHTS[i], 0);
  const r = sum % 11;
  return vin[8] === (r === 10 ? "X" : String(r));
}

export type VinInfo = { vin: string; ok: boolean; error?: string; make?: string; country?: string; year?: number; warning?: string };

export function decodeVin(input: string, now = new Date()): VinInfo {
  const vin = normalizeVin(input);
  if (vin.length !== 17) return { vin, ok: false, error: `В VIN 17 знаков, а введено ${vin.length}` };
  if (!ALLOWED.test(vin)) return { vin, ok: false, error: "В VIN бывают только латинские буквы без I, O, Q и цифры" };
  const info: VinInfo = { vin, ok: true, make: WMI[vin.slice(0, 3)], country: country(vin), year: modelYear(vin, now) };
  if ("12345".includes(vin[0]) && !checkDigitOk(vin)) info.warning = "Контрольный знак не сходится: проверьте VIN";
  return info;
}
