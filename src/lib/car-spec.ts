// Параметры модификации автомобиля: общие для справочника автомобилей и формы автомобиля клиента.

/** Параметры в том порядке, в каком их заполняют в карточке автомобиля. */
export const CAR_SPEC_KEYS = ["body", "engineType", "engineVolume", "power", "engineCode", "transmission", "drive"] as const;
export type CarSpecKey = (typeof CAR_SPEC_KEYS)[number];

/** Модификация из справочника; мощность — текстом, как её вписывают в поле. */
export type CarModRow = {
  yearFrom: number | null;
  yearTo: number | null;
} & Record<CarSpecKey, string>;
