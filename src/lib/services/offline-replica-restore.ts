import { Prisma } from "@prisma/client";
import { hashPassword } from "../auth-core";
import { UserError } from "../errors";
import { readReplica, replicaDigest, replicaFormat, replicaTables, type ReplicaTable } from "./offline-replica";

export type ReplicaSnapshot = {
  format: number;
  companyId: string;
  digest: string;
  tables: ReplicaTable[];
};

const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
export const cacheFields: Record<string, number | boolean> = {
  worksTotal: 0, itemsTotal: 0, total: 0, paid: 0, due: 0, totalsDirty: true,
};

export function restoreOrder() {
  const pending = new Set<string>(replicaTables);
  const order: string[] = [];
  while (pending.size) {
    const next = [...pending].find((table) => models.get(table)?.fields.every(
      (field) => !field.relationFromFields?.length || !pending.has(field.type),
    ));
    if (!next) throw new Error("Циклическая зависимость таблиц в снимке");
    order.push(next);
    pending.delete(next);
  }
  return order;
}

/** Initial restore only. The caller owns the transaction on a newly provisioned local database. */
export async function restoreReplica(
  tx: Prisma.TransactionClient,
  snapshot: ReplicaSnapshot,
  account: { userId: string; password: string },
) {
  const { format, companyId, digest, tables } = snapshot;
  if (
    format !== replicaFormat ||
    tables.length !== replicaTables.length ||
    tables.some(({ table }, i) => table !== replicaTables[i]) ||
    replicaDigest(companyId, tables) !== digest
  ) throw new UserError("Снимок СТО повреждён или несовместим");

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(61123, 1)`;
  if (await tx.company.count() || await tx.user.count()) {
    throw new UserError("Снимок можно загрузить только в пустую локальную базу");
  }

  const tableData = new Map(tables.map(({ table, rows }) => [table, rows]));
  const companyRows = tableData.get("Company") ?? [];
  if (companyRows.length !== 1 || JSON.parse(companyRows[0]).id !== companyId) {
    throw new UserError("Снимок должен содержать одну СТО");
  }
  const hasOwner = (tableData.get("Membership") ?? []).some((row) => {
    const member = JSON.parse(row);
    return member.userId === account.userId && member.companyId === companyId && member.role === "OWNER";
  });
  if (!hasOwner || account.password.length < 8) throw new UserError("Требуется владелец СТО и локальный пароль от восьми символов");
  const localHash = await hashPassword(account.password);

  for (const table of restoreOrder()) {
    const rows = tableData.get(table) ?? [];
    if (rows.length === 0) continue;
    const identifier = Prisma.raw('"' + table + '"');
    const defaults = Object.fromEntries(models.get(table)!.fields
      .filter((field) => Object.hasOwn(cacheFields, field.name))
      .map((field) => [field.name, cacheFields[field.name]]));
    if (table === "User") {
      await tx.$executeRaw`INSERT INTO ${identifier}
        SELECT (jsonb_populate_record(NULL::${identifier}, value || jsonb_build_object(
          'passwordHash', CASE WHEN value->>'id' = ${account.userId} THEN ${localHash} ELSE '!' END
        ))).* FROM jsonb_array_elements(${"[" + rows.join(",") + "]"}::jsonb)`;
    } else {
      // Existing values win. Cache fields omitted from the digest are initialized for recalculation.
      await tx.$executeRaw`INSERT INTO ${identifier}
        SELECT (jsonb_populate_record(NULL::${identifier}, ${JSON.stringify(defaults)}::jsonb || value)).*
        FROM jsonb_array_elements(${"[" + rows.join(",") + "]"}::jsonb)`;
    }
  }

  const local = await readReplica(tx, companyId);
  if (local.digest !== digest) throw new UserError("Сверка локальной базы после загрузки не прошла");
  return local.digest;
}
