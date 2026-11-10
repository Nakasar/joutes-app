import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import { readGroupMetaParams } from "@/lib/play-groups/meta";
import { readGroupMeta } from "@/lib/play-groups/meta-data";

type Params = Promise<{ playGroupId: string }>;

/**
 * La méta du groupe, pour l'application mobile : ce que calcule la vue
 * `?view=meta`, avec les mêmes paramètres (`jeu`, `ext` — un code
 * d'extension ou `tout` —, `membre`, `comparer=0`). Réservé aux membres.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { playGroupId } = await params;
  const gate = await readPlayGroupViewer(request, playGroupId);
  if ("error" in gate) return gate.error;

  try {
    const memberIds = gate.group.members.map((member) => member.userId);
    const page = await readGroupMeta(memberIds, readGroupMetaParams(Object.fromEntries(request.nextUrl.searchParams)));
    return NextResponse.json(page);
  } catch (error) {
    console.error("Error reading play-group meta:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
