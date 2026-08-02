import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getCubeAccess, getCubeById, getCubeCards, getCubePacks } from "@/lib/db/cubes";
import { formatCubeCardList } from "@/lib/cubes/card-list";

/**
 * Cube entier au format liste de cartes : les paquets se suivent, chacun
 * annoncé par un commentaire. Ouvert à qui peut consulter le cube, comme la
 * page qui en affiche déjà le contenu.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ cubeId: string }> }) {
  const { cubeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  const cube = await getCubeById(cubeId);
  if (!cube || !getCubeAccess(cube, session?.user?.id).canView) {
    return NextResponse.json({ error: "Cube introuvable" }, { status: 404 });
  }

  const [t, packs, cards] = await Promise.all([
    getTranslations("Cubes"),
    getCubePacks(cubeId),
    getCubeCards(cubeId),
  ]);

  const byPack = new Map<string, typeof cards>();
  for (const card of cards) {
    const bucket = byPack.get(card.packId);
    if (bucket) {
      bucket.push(card);
    } else {
      byPack.set(card.packId, [card]);
    }
  }

  const text = formatCubeCardList(
    packs.map((pack, index) => ({
      // Même nom de repli que les écrans du cube : un paquet sans nom est
      // désigné par son rang.
      label: pack.name || t("packFallbackName", { index: index + 1 }),
      cards: byPack.get(pack.id) ?? [],
    })),
  );

  return NextResponse.json({ text });
}
