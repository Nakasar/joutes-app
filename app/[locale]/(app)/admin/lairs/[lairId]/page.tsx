import { Link } from "@/i18n/navigation.ts";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getLairById, getLairEventsRefreshReport, getLairEventsSourceRequest } from "@/lib/db/lairs.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getUserById } from "@/lib/db/users.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import LairTabsBar, { readLairTab } from "./LairTabsBar.tsx";
import { LairIdentityForm } from "./LairIdentityForm.tsx";
import { LairGamesForm } from "./LairGamesForm.tsx";
import { LairEventSourcesForm } from "./LairEventSourcesForm.tsx";
import { CalendarModeSwitch } from "../CalendarModeSwitch.tsx";
import { AdminPage, AdminPanel } from "../../_components/AdminPage.tsx";

/**
 * La fiche d'administration d'un lieu.
 *
 * Ce que la modale de 752 lignes tenait dans une boîte à `max-w-2xl`, réparti
 * en onglets qui enregistrent chacun leurs seuls champs. La configuration d'une
 * source en correspondance y gagne l'essentiel : ses deux tableaux se lisent
 * enfin côte à côte.
 *
 * Ce que cet écran ne reprend pas : la vitrine du lieu — thème, ordre des
 * sections, annonces — et ses gérants, qui ont leur propre écran, écrit pour le
 * gérant et déjà ouvert aux administrateurs. Les dupliquer ici aurait fait deux
 * formulaires à tenir d'accord sur les mêmes champs.
 */
export default async function AdminLairPage({
  params,
  searchParams,
}: {
  params: Promise<{ lairId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();

  const { lairId } = await params;
  const { tab } = await searchParams;

  // Un identifiant mal formé fait lever `getLairById` (ObjectId invalide) :
  // c'est une adresse saisie à la main, elle mérite un 404.
  const lair = await (async () => {
    try {
      return await getLairById(lairId);
    } catch {
      return null;
    }
  })();

  if (!lair) notFound();

  const games = await getAllGames();
  const active = readLairTab(tab);
  // Le compte rendu et la demande d'aide vivent hors du lieu (voir
  // `getLairEventsRefreshReport`) ; deux lectures d'un seul document, qui
  // donnent l'état de l'agenda affiché dans l'en-tête de chaque onglet.
  const [refreshReport, sourceRequest] = await Promise.all([
    getLairEventsRefreshReport(lair.id),
    getLairEventsSourceRequest(lair.id),
  ]);
  // La demande d'aide du gérant, avec son courriel pour lui répondre.
  const requester = active === "sources" && sourceRequest ? await getUserById(sourceRequest.requestedBy) : null;
  const helpRequest = sourceRequest
    ? {
        ...(sourceRequest.url ? { url: sourceRequest.url } : {}),
        ...(sourceRequest.note ? { note: sourceRequest.note } : {}),
        requestedAt: sourceRequest.requestedAt,
        status: sourceRequest.status,
        ...(requester?.email ? { requesterEmail: requester.email } : {}),
      }
    : null;
  const declaredGames = games.filter((game) => lair.games?.includes(game.id));
  const sourcesCount = lair.eventsSourceUrls?.length ?? 0;
  const failing = refreshReport?.sources.some((source) => !source.ok) ?? false;
  const helpPending = sourceRequest?.status === "pending";

  return (
    <AdminPage
      back={{ href: "/admin/lairs", label: "Lieux" }}
      title={
        <span className="flex items-center gap-3">
          {lair.banner ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lair.banner} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-xl font-bold text-white dark:bg-sky-500">
              {lair.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">{lair.name}</span>
          {lair.isPrivate && <Badge variant="secondary">Privé</Badge>}
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {declaredGames.length === 0 ? (
            <span>Aucun jeu déclaré</span>
          ) : (
            <span className="flex flex-wrap gap-1">
              {declaredGames.map((game) => (
                <span key={game.id} className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                  {game.name}
                </span>
              ))}
            </span>
          )}
          <span>
            {sourcesCount === 0
              ? "Agenda saisi à la main"
              : `${sourcesCount} source${sourcesCount > 1 ? "s" : ""} d'évènements`}
          </span>
          {(failing || helpPending) && (
            <span className="flex items-center gap-1.5 font-medium text-red-800 dark:text-red-300">
              <span className="size-2 rounded-full bg-red-600" aria-hidden />
              {helpPending ? "Le gérant demande de l'aide" : "Import en échec"}
            </span>
          )}
        </span>
      }
      actions={
        <Button variant="outline" asChild className="h-10">
          <Link href={`/lairs/${lair.id}`}>Voir la vitrine</Link>
        </Button>
      }
    >
        <LairTabsBar lairId={lairId} active={active} alert={failing || helpPending} />

        {active === "identite" && <LairIdentityForm lair={lair} />}

        {active === "jeux" && <LairGamesForm lair={lair} games={games} />}

        {active === "sources" && (
          <LairEventSourcesForm lair={lair} report={refreshReport} helpRequest={helpRequest} />
        )}

        {active === "vitrine" && (
          <div className="space-y-6">
            <AdminPanel className="space-y-4 p-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Vue du calendrier</h2>
                <p className="text-sm text-muted-foreground">
                  Comment l&apos;agenda du lieu se présente aux visiteurs. Le changement est
                  enregistré aussitôt.
                </p>
              </div>
              <CalendarModeSwitch lair={lair} />
            </AdminPanel>

            <AdminPanel className="space-y-4 p-6">
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Vitrine, annonces et gérants
                </h2>
                <p className="text-sm text-muted-foreground">
                  Le thème du lieu, l&apos;ordre de ses sections, ses annonces, ses gérants et son
                  accès Pro se règlent depuis son écran de gestion — celui que voit son gérant, et
                  qui vous est ouvert.
                </p>
              </div>
              <Button variant="outline" asChild>
                <Link href={`/lairs/${lair.id}/manage`}>Ouvrir la gestion du lieu</Link>
              </Button>
            </AdminPanel>
          </div>
        )}
    </AdminPage>
  );
}
