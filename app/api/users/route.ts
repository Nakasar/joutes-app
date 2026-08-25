import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { readRegistryFilters } from "@/lib/users/registry-search";
import { searchRegistry } from "@/lib/users/registry";

/**
 * Le registre de la communauté : les comptes qui ont ouvert leur vitrine.
 *
 * Les paramètres sont **exactement** ceux que lit la page web
 * (`readRegistryFilters`, `lib/users/registry-search.ts`) : `q`, `game`,
 * `city`, `sells=1`, `live=1`, `sort`, `count`. C'est ce qui garantit qu'un
 * lien collé dans une conversation et un appel d'application ouvrent la même
 * page de résultats.
 *
 * **`count` est un compteur cumulé, pas un numéro de page.** Il monte de vingt
 * en vingt jusqu'à cent, et chaque appel rend la liste entière depuis le début.
 * C'est ce que fait « charger plus » sur le web, et la pagination du registre
 * n'a jamais été autre chose ; un `page`/`offset` mentirait sur la mécanique.
 *
 * Session facultative : elle ne sert qu'à renseigner `isFollowing` sur chaque
 * fiche. Sans elle, la liste est la même, tous les `isFollowing` à `false`.
 *
 * Deux filtres coûtent cher, et le savent : « en direct » lit les chaînes
 * liées, « vend des cartes » lit une liste de vente par candidat (jusqu'à
 * cent). Ils sont résolus dans cet ordre pour que le second travaille sur une
 * liste déjà réduite.
 */
export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = readRegistryFilters(params);

    const viewer = await authenticateApiRequest(request);

    const { entries, total, hasMore } = await searchRegistry(filters, viewer?.userId ?? null);

    return NextResponse.json({ entries, total, hasMore, count: filters.count });
  } catch (error) {
    console.error("Error reading the community registry:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
