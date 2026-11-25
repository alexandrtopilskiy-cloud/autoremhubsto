import { Prisma } from "@prisma/client";
import { z } from "zod";
import { UserError } from "../errors";
import { replicaDigest, replicaFormat, replicaTables, readReplica } from "./offline-replica";
import { cacheFields, restoreOrder, type ReplicaSnapshot } from "./offline-replica-restore";

export const syncSnapshotSchema = z.object({
  format: z.literal(replicaFormat),
  companyId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  tables: z.array(z.object({ table: z.string(), rows: z.array(z.string()) })).length(replicaTables.length),
});

type Row = Record<string, unknown>;
type Indexed = Map<string, Map<string, { row: Row; raw: string }>>;
const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
const protectedTables = new Set(["User", "Membership", "CompanyRole"]);
const primary = (table: string) => {
  const model = models.get(table)!;
  return model.primaryKey?.fields ?? model.fields.filter((field) => field.isId).map((field) => field.name);
};
const identity = (row: Row, fields: readonly string[]) => JSON.stringify(fields.map((field) => row[field]));

function index(snapshot: ReplicaSnapshot): Indexed {
  if (snapshot.tables.some((x, i) => x.table !== replicaTables[i]) ||
      snapshot.tables.length !== replicaTables.length ||
      replicaDigest(snapshot.companyId, snapshot.tables) !== snapshot.digest) {
    throw new UserError("Контрольная сумма базы не совпадает.");
  }
  return new Map(snapshot.tables.map(({ table, rows }) => {
    const keys = primary(table);
    const entries = new Map<string, { row: Row; raw: string }>();
    for (const raw of rows) {
      const row = JSON.parse(raw) as Row;
      if (!row || keys.length === 0 || keys.some(k => typeof row[k] !== "string")) {
        throw new UserError("Не удалось определить ключ строки снимка.");
      }
      const key = identity(row, keys);
      if (entries.has(key)) throw new UserError("В снимке обнаружены повторяющиеся строки.");
      entries.set(key, { row, raw });
    }
    return [table, entries];
  }));
}

function validateScope(rows: Indexed, companyId: string) {
  const company = rows.get("Company")!;
  if (company.size !== 1 || !company.has(JSON.stringify([companyId]))) {
    throw new UserError("Сверка ограничена одной СТО.");
  }
  const indexes = new Map<string, Set<string>>();
  for (const [table, entries] of rows) {
    const refs = models.get(table)!.fields.filter(f => f.relationFromFields?.length);
    for (const { row } of entries.values()) {
      if (Object.hasOwn(row, "companyId") && row.companyId !== companyId) throw new UserError("Обнаружены данные другой СТО.");
      for (const ref of refs) {
        const from = ref.relationFromFields!;
        const to = ref.relationToFields!;
        if (from.every(key => row[key] === null)) continue;
        const cacheKey = JSON.stringify([ref.type, to]);
        let target = indexes.get(cacheKey);
        if (!target) {
          const parent = rows.get(ref.type);
          if (!parent) throw new UserError("Ссылка за пределами снимка СТО.");
          target = new Set([...parent.values()].map(({row}) => identity(row, to)));
          indexes.set(cacheKey, target);
        }
        if (!target.has(identity(row, from))) throw new UserError("Ссылка за пределами снимка СТО.");
      }
    }
  }
}

export function reconcileReplica(base: ReplicaSnapshot, local: ReplicaSnapshot, cloud: ReplicaSnapshot): ReplicaSnapshot {
  if (base.companyId !== local.companyId || local.companyId !== cloud.companyId) throw new UserError("Снимки разных СТО.");
  const a = index(base), l = index(local), c = index(cloud);
  const tables = replicaTables.map(table => {
    const common = a.get(table)!, ours = l.get(table)!, theirs = c.get(table)!;
    const merged = new Map(theirs);
    for (const key of new Set([...common.keys(), ...ours.keys()])) {
      const old = common.get(key)?.raw;
      const changed = ours.get(key);
      if (changed?.raw === old) continue;
      const remote = theirs.get(key)?.raw;
      if (protectedTables.has(table)) {
        if (table === "User" && !changed) continue;
        throw new UserError("Изменения пользователей и прав выполняются в онлайн-кабинете.");
      }
      if (remote !== old && remote !== changed?.raw) {
        throw new UserError(`Конфликт синхронизации в разделе ${table}. Обе версии сохранены.`);
      }
      if (changed) merged.set(key, changed);
      else merged.delete(key);
    }
    return {
      table,
      rows: [...merged.values()].sort((a, b) => {
        for (const field of primary(table).filter(key => key !== "companyId")) {
          const order = Buffer.compare(Buffer.from(String(a.row[field])), Buffer.from(String(b.row[field])));
          if (order) return order;
        }
        return 0;
      }).map(({raw}) => raw),
    };
  });
  return { format: replicaFormat, companyId: cloud.companyId, digest: replicaDigest(cloud.companyId, tables), tables };
}

export async function applyReplica(tx: Prisma.TransactionClient, source: ReplicaSnapshot, target: ReplicaSnapshot, local: boolean) {
  if (source.companyId !== target.companyId) throw new UserError("Снимки разных СТО.");
  if (source.digest === target.digest) return source;
  const before = index(source), after = index(target);
  validateScope(after, source.companyId);
  await tx.$queryRaw`SELECT set_config('sto.sync_company', ${source.companyId}, true)`;
  const order = restoreOrder();
  // Delete dependents before their parent. Updates that would violate any constraint
  // roll back the whole batch, including the server's write lock.
  for (const table of [...order].reverse()) {
    if (table === "Company" || (!local && table === "User")) continue;
    const desired = after.get(table)!;
    const removed = [...before.get(table)!.entries()].filter(([key]) => !desired.has(key)).map(([, row]) => row.raw);
    if (!removed.length) continue;
    const id = Prisma.raw('"' + table + '"');
    const match = Prisma.join(primary(table).map(key => Prisma.raw(`t."${key}" = r."${key}"`)), " AND ");
    await tx.$executeRaw`DELETE FROM ${id} t USING
      jsonb_populate_recordset(NULL::${id}, ${"[" + removed.join(",") + "]"}::jsonb) r WHERE ${match}`;
  }
  for (const table of order) {
    if (!local && table === "User") continue;
    const existing = before.get(table)!;
    const changed = [...after.get(table)!.entries()].filter(([key, value]) => existing.get(key)?.raw !== value.raw).map(([, row]) => row.raw);
    if (!changed.length) continue;
    const id = Prisma.raw('"' + table + '"');
    const keys = primary(table);
    const keyList = Prisma.join(keys.map(key => Prisma.raw('"' + key + '"')));
    const fields = models.get(table)!.fields.filter(f => f.kind !== "object");
    const defaults: Record<string, unknown> = Object.fromEntries(fields.filter(f => Object.hasOwn(cacheFields, f.name)).map(f => [f.name, cacheFields[f.name]]));
    if (table === "User") defaults.passwordHash = "!";
    const updates = Prisma.join(fields.filter(f => !keys.includes(f.name) && f.name !== "passwordHash")
      .map(f => Prisma.raw(`"${f.name}" = EXCLUDED."${f.name}"`)));
    // Never let an upsert target a row outside the scoped current snapshot.
    const authorized = [...existing.values()].map(({raw}) => raw);
    const match = Prisma.join(keys.map(key => Prisma.raw(`old."${key}" = EXCLUDED."${key}"`)), " AND ");
    await tx.$executeRaw`INSERT INTO ${id}
      SELECT (jsonb_populate_record(NULL::${id}, ${JSON.stringify(defaults)}::jsonb || value)).*
      FROM jsonb_array_elements(${"[" + changed.join(",") + "]"}::jsonb) WHERE true
      ON CONFLICT (${keyList}) DO UPDATE SET ${updates} WHERE EXISTS (
        SELECT 1 FROM jsonb_populate_recordset(NULL::${id}, ${"[" + authorized.join(",") + "]"}::jsonb) old WHERE ${match}
      )`;
  }
  const result = await readReplica(tx, source.companyId);
  if (result.digest !== target.digest) throw new UserError("Итоговая сверка базы не прошла. Исходные данные сохранены.");
  return result;
}
