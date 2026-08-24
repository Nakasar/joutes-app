import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { resolveTradeCardDesignations } from "@/lib/db/trades";
import { tradeCardResolveSchema } from "@/lib/schemas/trade.schema";

/**
 * Apparie une liste de cartes écrite en texte à des impressions réelles.
 *
 * L'appariement se fait ici, contre la collection ou le catalogue : le
 * navigateur n'a ni l'une ni l'autre, et les télécharger pour lire trente
 * lignes serait payer très cher une commodité. La réponse suit l'ordre des
 * désignations envoyées, `null` marquant celles qu'aucune carte ne satisfait.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = tradeCardResolveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid card list", details: parsed.error }, { status: 400 });
  }

  try {
    const matches = await resolveTradeCardDesignations({
      userId: session.user.id,
      scope: parsed.data.scope,
      designations: parsed.data.cards,
    });

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("Error resolving trade cards:", error);
    return NextResponse.json({ error: "Failed to resolve cards" }, { status: 500 });
  }
}
