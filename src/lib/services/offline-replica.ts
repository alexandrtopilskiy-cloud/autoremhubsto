import { createHash, createPublicKey, randomBytes, verify } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { OFFLINE_READ_ONLY_MESSAGE, UserError } from "../errors";
import { prisma } from "../db";
import { lockReserve } from "./offline-reserve";

const directTables = [
  "Organization", "Membership", "CompanyRole", "Counter", "Client", "Vehicle", "CarModification",
  "Employee", "Work", "WorkGroup", "Product", "ProductGroup", "WorkOrder", "Payment", "Supplier",
  "Receipt", "StockMove", "Cashbox", "CashCategory", "CashOperation", "Workplace", "Appointment",
  "Attachment", "Estimate", "Recommendation", "PartsRequest", "Sale", "WriteOff", "Inventory",
  "SupplierOrder", "PayrollEntry", "PriceCategory", "DictionaryItem", "TrashItem",
] as const;

const childTables = [
  ["ClientContact", "Client", "clientId"],
  ["ClientBankAccount", "Client", "clientId"],
  ["WorkOrderWork", "WorkOrder", "orderId"],
  ["WorkOrderItem", "WorkOrder", "orderId"],
  ["ReceiptLine", "Receipt", "receiptId"],
  ["EstimateLine", "Estimate", "estimateId"],
  ["PartsRequestLine", "PartsRequest", "requestId"],
  ["Inspection", "WorkOrder", "orderId"],
  ["SaleLine", "Sale", "saleId"],
  ["WriteOffLine", "WriteOff", "writeOffId"],
  ["InventoryLine", "Inventory", "inventoryId"],
  ["SupplierOrderLine", "SupplierOrder", "orderId"],
  ["ProductPrice", "Product", "productId"],
] as const;

// These columns are read caches. A cloud list refresh may change them even in read-only mode.
const derivedTables = new Set<string>(["WorkOrder", "Receipt", "Sale", "Estimate"]);
const derivedColumns = ["worksTotal", "itemsTotal", "total", "paid", "due", "totalsDirty"];
export const replicaFormat = 1;

export type ReplicaTable = { table: string; rows: string[] };

export function replicaDigest(companyId: string, tables: readonly ReplicaTable[]) {
  const hash = createHash("sha256").update(JSON.stringify([replicaFormat, companyId]) + "\n");
  for (const { table, rows } of tables) {
    hash.update(JSON.stringify([table, rows.length]) + "\n");
    for (const row of rows) hash.update(row + "\n");
  }
  return hash.digest("hex");
}

export const replicaTables = [
  "Company", "User", ...directTables, ...childTables.map(([table]) => table),
] as const;

export async function readReplica(tx: Prisma.TransactionClient, companyId: string) {
  const tables: ReplicaTable[] = [];

  async function add(table: string, where: Prisma.Sql, by = Prisma.sql`r."id" COLLATE "C"`) {
    // Identifiers come only from the schema inventory above. Keep PostgreSQL's JSON text
    // intact so decimals, timestamps and bytea round trip without the JS JSON parser.
    const row = derivedTables.has(table)
      ? Prisma.sql`to_jsonb(r) - ARRAY[${Prisma.join(derivedColumns)}]::text[]`
      : table === "User"
        ? Prisma.sql`jsonb_build_object('id', r.id, 'email', r.email, 'name', r.name, 'createdAt', r."createdAt")`
        : Prisma.sql`to_jsonb(r)`;
    const result = await tx.$queryRaw<{ row: string }[]>`SELECT (${row})::text AS row
      FROM ${Prisma.raw('"' + table + '"')} r WHERE ${where} ORDER BY ${by}`;
    tables.push({ table, rows: result.map((record) => record.row) });
  }

  await add("Company", Prisma.sql`r.id = ${companyId}`);
  await add("User", Prisma.sql`r.id IN (
    SELECT "userId" FROM "Membership" WHERE "companyId" = ${companyId}
    UNION SELECT "userId" FROM "Employee" WHERE "companyId" = ${companyId}
    UNION SELECT "requestedById" FROM "PartsRequest" WHERE "companyId" = ${companyId}
  )`);
  for (const table of directTables) {
    const order = table === "Counter" ? Prisma.sql`r.key COLLATE "C"` : Prisma.sql`r.id COLLATE "C"`;
    await add(table, Prisma.sql`r."companyId" = ${companyId}`, order);
  }
  for (const [table, parent, key] of childTables) {
    const order = table === "ProductPrice"
      ? Prisma.sql`r."productId" COLLATE "C", r."categoryId" COLLATE "C"`
      : Prisma.sql`r.id COLLATE "C"`;
    await add(table, Prisma.sql`EXISTS (
      SELECT 1 FROM ${Prisma.raw('"' + parent + '"')} p
      WHERE p.id = ${Prisma.raw('r."' + key + '"')} AND p."companyId" = ${companyId}
    )`, order);
  }
  return { format: replicaFormat, companyId, digest: replicaDigest(companyId, tables), tables };
}

export const replicaRequestSchema = z.object({
  companyId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  at: z.number().int(),
  publicKey: z.string().regex(/^[A-Za-z0-9_-]{59}$/),
  signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
  digest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).strict();

export const desktopReplicaRequestSchema = replicaRequestSchema.omit({ companyId: true }).extend({
  code: z.string().regex(/^[A-Za-z0-9_-]{32}$/),
});

type ReplicaRequest = z.infer<typeof replicaRequestSchema>;
type DesktopReplicaRequest = z.infer<typeof desktopReplicaRequestSchema>;

function codeHash(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function issueReplicaCode(companyId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    await lockReserve(tx, companyId);
    const device = await tx.offlineWorkstation.findUnique({
      where: { companyId },
      select: { pairedAt: true, reserve: { select: { phase: true, master: { select: { role: true, userId: true } } } } },
    });
    if (!device?.pairedAt || device.reserve.master.role !== "OWNER" || device.reserve.master.userId !== userId) {
      throw new UserError("Код доступен владельцу, назначенному мастером и привязавшему ПК");
    }
    if (device.reserve.phase !== "ONLINE") throw new UserError(OFFLINE_READ_ONLY_MESSAGE);
    const code = randomBytes(24).toString("base64url");
    await tx.offlineWorkstation.update({
      where: { companyId },
      data: { replicaCodeHash: codeHash(code), replicaCodeExpiry: new Date(Date.now() + 15 * 60_000) },
    });
    return code;
  });
}

export function requestReplica(userId: string, input: ReplicaRequest) {
  return serveReplica(input, { userId, companyId: input.companyId });
}

export function requestDesktopReplica(input: DesktopReplicaRequest) {
  return serveReplica(input, { code: input.code });
}

async function serveReplica(
  input: ReplicaRequest | DesktopReplicaRequest,
  access: { userId: string; companyId: string } | { code: string },
) {
  if (Math.abs(Date.now() - input.at) > 120_000) return { status: 401 } as const;
  const purpose = input.digest ? "confirm" : "snapshot";
  const desktop = "code" in access;
  const scope = desktop ? access.code : access.companyId;
  const protocol = desktop ? "autoremhubsto/desktop-replica/v1" : "autoremhubsto/replica/v1";
  const message = Buffer.from(JSON.stringify([protocol, purpose, scope, input.at, input.digest ?? null]));
  try {
    const key = createPublicKey({ key: Buffer.from(input.publicKey, "base64url"), format: "der", type: "spki" });
    if (key.asymmetricKeyType !== "ed25519" || !verify(null, message, key, Buffer.from(input.signature, "base64url"))) {
      return { status: 401 } as const;
    }
  } catch {
    return { status: 401 } as const;
  }

  const hash = desktop ? codeHash(access.code) : null;
  const companyId = hash
    ? (await prisma.offlineWorkstation.findUnique({ where: { replicaCodeHash: hash }, select: { companyId: true } }))?.companyId
    : scope;
  if (!companyId) return { status: 403 } as const;

  return prisma.$transaction(async (tx) => {
    // Confirmation takes the exclusive side of the write lock. A cloud change
    // after confirmation clears the marker in the same transaction as the change.
    if (input.digest) await lockReserve(tx, companyId);
    const workstation = await tx.offlineWorkstation.findUnique({
      where: { companyId },
      select: { publicKey: true, pairedAt: true, replicaCodeHash: true, replicaCodeExpiry: true, reserve: { select: { phase: true, master: { select: { role: true, userId: true } } } } },
    });
    if (
      !workstation?.pairedAt || workstation.publicKey !== input.publicKey ||
      workstation.reserve.master.role !== "OWNER" ||
      (desktop
        ? workstation.replicaCodeHash !== hash || !workstation.replicaCodeExpiry || workstation.replicaCodeExpiry <= new Date()
        : workstation.reserve.master.userId !== access.userId)
    ) {
      return { status: 403 } as const;
    }
    if (workstation.reserve.phase !== "ONLINE") return { status: 409 } as const;
    const replica = await readReplica(tx, companyId);
    if (!input.digest) {
      return { status: 200, body: desktop ? { ...replica, masterUserId: workstation.reserve.master.userId } : replica } as const;
    }
    if (input.digest !== replica.digest) {
      await tx.offlineWorkstation.update({ where: { companyId }, data: { replicaVerifiedAt: null } });
      return { status: 409 } as const;
    }
    const verifiedAt = new Date();
    await tx.offlineWorkstation.update({
      where: { companyId },
      data: { replicaVerifiedAt: verifiedAt, ...(desktop ? { replicaCodeHash: null, replicaCodeExpiry: null } : {}) },
    });
    return { status: 200, body: { verifiedAt, digest: replica.digest } } as const;
  }, {
    // Snapshots read a single MVCC view. Confirmation takes its write lock before
    // reading and therefore uses a fresh view after any in-flight writer commits.
    isolationLevel: input.digest ? Prisma.TransactionIsolationLevel.ReadCommitted : Prisma.TransactionIsolationLevel.RepeatableRead,
    timeout: 60_000,
  });
}
