import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getOwnedCardGameIds } from "@/lib/db/collection";
import { computeCollectionValues, gameIdsToRevalue } from "@/lib/db/collection-values";
import { totalCollectionValue } from "@/lib/collection/value";

/**
 * Recalcule la valeur estimée de toute la collection : chaque jeu dont le
 * compte possède au moins une carte est réestimé au prix du moment, et le
 * total s'en déduit.
 *
 * Une action explicite : les prix ne sont relevés que de temps en temps (cf.
 * docs/CARD_PRICES.md), et une valeur datée du dernier clic se comprend mieux
 * qu'un total qui bouge tout seul. C'est aussi ce qui borne le coût — la somme
 * porte sur tous les exemplaires possédés, pas sur une page.
 */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const owner = { type: "user", id: session.user.id } as const;

  try {
    const gameIds = await gameIdsToRevalue(owner, await getOwnedCardGameIds(owner));
    const values = await computeCollectionValues(owner, gameIds);

    return NextResponse.json({
      // Par jeu, pour que l'écran remplace ses chiffres sans tout recharger.
      values: Object.fromEntries(values),
      value: totalCollectionValue([...values.values()]) ?? null,
    });
  } catch (error) {
    console.error("Error computing collection value:", error);
    return NextResponse.json({ error: "Failed to compute collection value" }, { status: 500 });
  }
}
