"use server";

import { requireSession } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { issueWorkstationCode } from "@/lib/services/offline-reserve";

type PairingState = { code: string } | { error: string } | null;

export async function issueWorkstationCodeAction(): Promise<PairingState> {
  const s = await requireSession();
  try {
    const { code } = await issueWorkstationCode(s.companyId, s.userId);
    return { code };
  } catch (error) {
    if (error instanceof UserError) return { error: error.message };
    throw error;
  }
}
