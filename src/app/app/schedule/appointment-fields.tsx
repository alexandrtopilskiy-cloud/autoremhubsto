import { Field, Input, Select } from "@/components/ui";
import { vehicleTitle } from "@/lib/format";

type Opt = { id: string; name: string };
type ClientOpt = Opt & { phone: string | null; vehicles: { id: string; make: string; model: string; year: number | null; plate: string | null }[] };

export type AppointmentDefaults = {
  workplaceId?: string;
  date: string;
  start?: string;
  end?: string;
  clientId?: string | null;
  vehicleId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  reason?: string | null;
  amount?: number;
  masterId?: string | null;
};

export function AppointmentFields({
  d,
  workplaces,
  clients,
  employees,
}: {
  d: AppointmentDefaults;
  workplaces: Opt[];
  clients: ClientOpt[];
  employees: Opt[];
}) {
  return (
    <>
      <Field label="Пост">
        <Select name="workplaceId" defaultValue={d.workplaceId ?? workplaces[0]?.id}>
          {workplaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Дата">
        <Input type="date" name="date" defaultValue={d.date} required />
      </Field>
      <Field label="Начало">
        <Input type="time" name="start" step={900} defaultValue={d.start ?? "10:00"} required />
      </Field>
      <Field label="Окончание">
        <Input type="time" name="end" step={900} defaultValue={d.end ?? "11:00"} required />
      </Field>
      <Field label="Мастер">
        <Select name="masterId" defaultValue={d.masterId ?? ""}>
          <option value="">Не указан</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Клиент из базы" className="min-w-56">
        <Select name="clientId" defaultValue={d.clientId ?? ""}>
          <option value="">Новый клиент</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.phone ?? ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Автомобиль" className="min-w-56">
        <Select name="vehicleId" defaultValue={d.vehicleId ?? ""}>
          <option value="">Не указан</option>
          {clients
            .filter((c) => c.vehicles.length > 0)
            .map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleTitle(v)}
                  </option>
                ))}
              </optgroup>
            ))}
        </Select>
      </Field>
      <Field label="Имя нового клиента">
        <Input name="contactName" defaultValue={d.contactName ?? ""} />
      </Field>
      <Field label="Телефон">
        <Input name="contactPhone" type="tel" defaultValue={d.contactPhone ?? ""} />
      </Field>
      <Field label="Причина обращения" className="min-w-64 flex-1">
        <Input name="reason" defaultValue={d.reason ?? ""} />
      </Field>
      <Field label="Сумма (ориентир), ₽">
        <Input name="amount" inputMode="decimal" defaultValue={d.amount ? (d.amount / 100).toFixed(2).replace(".", ",") : ""} className="w-32" />
      </Field>
    </>
  );
}
