"use server";

import { revalidatePath } from "next/cache";
import type { RecommendationStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { run } from "@/lib/actions";
import { setRecommendationStatus } from "@/lib/services/recommendations";

export async function setRecStatusAction(id: string, status: RecommendationStatus) {
  const s = await requireSession();
  const res = await run(() => setRecommendationStatus(s.companyId, id, status));
  revalidatePath("/app/recommendations");
  return res;
}
