"use server";

import type { RecommendationStatus } from "@prisma/client";
import { setRecommendationStatus } from "@/lib/services/recommendations";
import { guarded } from "@/lib/guard";

export async function setRecStatusAction(id: string, status: RecommendationStatus) {
  return guarded("orders", "EDIT", "/app/recommendations", (c) => setRecommendationStatus(c, id, status));
}
