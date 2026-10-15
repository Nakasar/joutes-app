import { DateTime } from "luxon";
import { Filter } from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { listContributions } from "@/lib/db/contributions.ts";
import { getAdminUserSummaries } from "@/lib/db/users.ts";
import {
  CONTRIBUTION_KINDS,
  CONTRIBUTION_KIND_LABELS,
  decodeContributionCursor,
  encodeContributionCursor,
  readContributionKinds,
  type ContributionKind,
} from "@/lib/contributions/feed.ts";
import { adminUserProfilePath, adminUserTag } from "@/lib/users/admin-search.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

/**
 * Le centre des contributions : tout ce que les joueurs ont publié, du plus
 * récent au plus ancien, quel qu'en soit le type.
 *
 * Formulaire en GET et pages par curseur, comme la recherche d'utilisateurs :
 * le filtre et la position tiennent dans l'URL, se partagent et se rechargent.
 * Le curseur plutôt qu'un numéro de page : une publication arrivée entre deux
 * pages décalerait tout le reste d'une ligne.
 */
export default async function AdminContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; after?: string }>;
}) {
  await requireAdmin();

  const { type, after: afterParam } = await searchParams;
  const kind = CONTRIBUTION_KINDS.includes(type as ContributionKind) ? (type as ContributionKind) : undefined;
  const after = decodeContributionCursor(afterParam);

  const { items, next } = await listContributions({
    kinds: readContributionKinds(kind),
    after,
  });
  const authors = await getAdminUserSummaries(
    items.map((item) => item.authorId).filter((id): id is string => !!id),
  );

  const pageHref = (cursor: string | null) => {
    const search = new URLSearchParams();
    if (kind) search.set("type", kind);
    if (cursor) search.set("after", cursor);
    const query = search.toString();
    return query ? `/admin/contributions?${query}` : "/admin/contributions";
  };

  return (
    <div className="bg-muted/50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Centre des contributions</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tout ce que les joueurs ont publié, du plus récent au plus ancien : publications,
            errata et rulings, politiques de jeu, actualités, quizz, decks, listes de souhaits,
            évènements, tournois, ligues, lieux, groupes de jeu, et ce que ces groupes publient.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ce qui est resté privé (brouillons, decks et listes privés) n&apos;y figure pas, ni les
            évènements importés automatiquement par les lieux.
          </p>
        </div>

        <form method="get" className="mb-6 flex flex-wrap items-center gap-2">
          <select
            name="type"
            defaultValue={kind ?? ""}
            aria-label="Type de contribution"
            className="min-w-0 flex-1 sm:flex-none px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent"
          >
            <option value="">Tous les types</option>
            {CONTRIBUTION_KINDS.map((value) => (
              <option key={value} value={value}>
                {CONTRIBUTION_KIND_LABELS[value]}
              </option>
            ))}
          </select>
          <Button type="submit">
            <Filter className="mr-2 h-4 w-4" />
            Filtrer
          </Button>
        </form>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {after ? "Aucune contribution plus ancienne." : "Aucune contribution pour le moment."}
          </p>
        ) : (
          <div className="bg-card rounded-lg shadow-md overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Publié le
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Contribution
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Auteur
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {items.map((item) => {
                  const author = item.authorId ? authors.get(item.authorId) : undefined;
                  const date = DateTime.fromJSDate(item.publishedAt).setZone("Europe/Paris").setLocale("fr");

                  return (
                    <tr key={`${item.kind}:${item.id}`} className="align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                        <time dateTime={date.toISO() ?? undefined} title={date.toLocaleString(DateTime.DATETIME_FULL)}>
                          {date.toFormat("dd/MM/yyyy")}
                          <br />
                          {date.toFormat("HH:mm")}
                        </time>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary">{CONTRIBUTION_KIND_LABELS[item.kind]}</Badge>
                        {item.detail && (
                          <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 min-w-64 max-w-xl">
                        {item.url ? (
                          <Link href={item.url} className="text-sm font-medium text-foreground hover:underline">
                            {item.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-foreground">{item.title}</span>
                        )}
                        {item.excerpt && (
                          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.excerpt}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {author ? (
                          <Link href={adminUserProfilePath(author)} className="text-foreground hover:underline">
                            {adminUserTag(author)}
                          </Link>
                        ) : item.authorId ? (
                          <span className="text-muted-foreground">Compte supprimé</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          {after ? (
            <Button asChild variant="ghost">
              <Link href={pageHref(null)}>Revenir aux plus récentes</Link>
            </Button>
          ) : (
            <span />
          )}
          {next && (
            <Button asChild variant="outline">
              <Link href={pageHref(encodeContributionCursor(next))}>Plus anciennes</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
