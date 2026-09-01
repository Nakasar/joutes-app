import { Link } from "@/i18n/navigation.ts";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getLairById, getLairEventsRefreshReport } from "@/lib/db/lairs.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import LairTabsBar, { readLairTab } from "./LairTabsBar.tsx";
import { LairIdentityForm } from "./LairIdentityForm.tsx";
import { LairGamesForm } from "./LairGamesForm.tsx";
import { LairEventSourcesForm } from "./LairEventSourcesForm.tsx";
import { CalendarModeSwitch } from "../CalendarModeSwitch.tsx";

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
  // Le rapport n'est lu que pour l'onglet qui l'affiche : il est hors du lieu
  // à dessein (voir `getLairEventsRefreshReport`).
  const refreshReport = active === "sources" ? await getLairEventsRefreshReport(lair.id) : null;
  const declaredGames = games.filter((game) => lair.games?.includes(game.id));
  const sourcesCount = lair.eventsSourceUrls?.length ?? 0;

  return (
    <div className="bg-muted/50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <Link href="/admin/lairs" className="text-sm text-muted-foreground hover:text-foreground">
          ← Lieux
        </Link>

        <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {lair.banner ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lair.banner} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="h-14 w-20 shrink-0 rounded-lg bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground">
                {lair.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-foreground">{lair.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {lair.isPrivate && <Badge variant="secondary">Privé</Badge>}
                {declaredGames.length === 0 ? (
                  <span className="text-sm text-muted-foreground">Aucun jeu déclaré</span>
                ) : (
                  declaredGames.map((game) => (
                    <Badge key={game.id} variant="outline">
                      {game.name}
                    </Badge>
                  ))
                )}
                <span className="text-sm text-muted-foreground">
                  {sourcesCount} source{sourcesCount > 1 ? "s" : ""} d&apos;événements
                </span>
              </div>
            </div>
          </div>

          <Button variant="outline" asChild>
            <Link href={`/lairs/${lair.id}`}>Voir la vitrine</Link>
          </Button>
        </div>

        <LairTabsBar lairId={lairId} active={active} />

        {active === "identite" && <LairIdentityForm lair={lair} />}

        {active === "jeux" && <LairGamesForm lair={lair} games={games} />}

        {active === "sources" && <LairEventSourcesForm lair={lair} report={refreshReport} />}

        {active === "vitrine" && (
          <div className="space-y-6">
            <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Vue du calendrier</h2>
                <p className="text-sm text-muted-foreground">
                  Comment l&apos;agenda du lieu se présente aux visiteurs. Le changement est
                  enregistré aussitôt.
                </p>
              </div>
              <CalendarModeSwitch lair={lair} />
            </section>

            <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
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
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
