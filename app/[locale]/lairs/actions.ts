"use server";

import { searchLairs, PaginatedLairsResult } from "@/lib/db/lairs";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export type SearchLairsParams = {
  search?: string;
  gameIds?: string[];
  nearLocation?: {
    longitude: number;
    latitude: number;
    maxDistanceMeters: number;
  };
  page?: number;
  limit?: number;
};

export async function searchLairsAction(
  params: SearchLairsParams
): Promise<PaginatedLairsResult> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const result = await searchLairs({
    userId: session?.user?.id,
    search: params.search,
    gameIds: params.gameIds,
    nearLocation: params.nearLocation,
    page: params.page || 1,
    limit: params.limit || 10,
  });

  return result;
}
