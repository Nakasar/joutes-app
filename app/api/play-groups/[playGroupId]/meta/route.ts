import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import { readGroupMetaParams } from "@/lib/play-groups/meta";
import { readGroupMeta } from "@/lib/play-groups/meta-data";
import { metaPausedResponse, userCanSeeMeta } from "@/lib/meta/access";
import { META_PAUSED } from "@/lib/meta/paused";

type Params = Promise<{ playGroupId: string }>;

/**
 * La méta du groupe, pour l'application mobile : ce que calcule la vue
 * `?view=meta`, avec les mêmes paramètres (`jeu`, `ext` — un code
 * d'extension ou `tout` —, `membre`, `comparer=0`). Réservé aux membres, et
 * comme toute la méta aux abonnés Joutes Expert (403 `code: "SUBSCRIPTION"`).
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  if (META_PAUSED) return metaPausedResponse();
  const { playGroupId } = await params;
  const gate = await readPlayGroupViewer(request, playGroupId);
  if ("error" in gate) return gate.error;
  if (!(await userCanSeeMeta(gate.userId))) {
    return NextResponse.json(
      { error: "La méta est réservée aux abonnés Joutes Expert.", code: "SUBSCRIPTION" },
      { status: 403 },
    );
  }

  try {
    const memberIds = gate.group.members.map((member) => member.userId);
    const page = await readGroupMeta(playGroupId, memberIds, readGroupMetaParams(Object.fromEntries(request.nextUrl.searchParams)));
    return NextResponse.json(page);
  } catch (error) {
    console.error("Error reading play-group meta:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
