import { Link } from "@/i18n/navigation.ts";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getGameBySlugOrId } from "@/lib/db/games.ts";
import { GAME_TYPES } from "@/lib/constants/game-types.ts";
import { GAME_FEATURE_KEYS } from "@/lib/constants/game-features.ts";
import { getDeckZones } from "@/lib/decks/zones.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import GameTabsBar, { readGameTab } from "./GameTabsBar.tsx";
import { GameIdentityForm } from "./GameIdentityForm.tsx";
import { GameFeaturesForm } from "./GameFeaturesForm.tsx";
import { DeckBuilderForm } from "./DeckBuilderForm.tsx";
import { FeaturedLairsManager } from "../FeaturedLairsManager.tsx";

/**
 * La fiche d'administration d'un jeu.
 *
 * Ce que la modale d'édition tenait dans une boîte à `max-w-2xl` — identité,
 * images, fonctionnalités, lieux mis en avant — plus ce qu'elle n'aurait pas pu
 * tenir : les réglages du deck builder. Chaque onglet enregistre ses seuls
 * champs, de sorte qu'aucun n'écrase le travail d'un autre.
 *
 * Adressée par le slug, avec repli sur l'identifiant : `getGameBySlugOrId`
 * accepte les deux, et un jeu sans slug reste ainsi joignable.
 */
export default async function AdminGamePage({
  params,
  searchParams,
}: {
  params: Promise<{ gameSlug: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin();

  const { gameSlug } = await params;
  const { tab } = await searchParams;

  // Une adresse saisie à la main mérite un 404, pas une erreur serveur :
  // `getGameBySlugOrId` ne lève que sur un identifiant mal formé.
  const game = await (async () => {
    try {
      return await getGameBySlugOrId(gameSlug);
    } catch {
      return null;
    }
  })();

  if (!game) notFound();

  const active = readGameTab(tab);
  const enabledFeatures = GAME_FEATURE_KEYS.filter((key) => game.features?.[key] === true).length;
  const zones = getDeckZones(game);
  const configured = (game.deckBuilder?.zones?.length ?? 0) > 0;

  return (
    <div className="bg-muted/50 p-4 sm:p-8">
      <div className="max-w-6xl mx-auto">
        <Link
          href="/admin/games"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Jeux
        </Link>

        <div className="mt-2 mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {game.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={game.icon}
                alt=""
                className="size-14 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="size-14 shrink-0 rounded-lg bg-muted flex items-center justify-center text-xl font-semibold text-muted-foreground">
                {game.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-foreground">{game.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{GAME_TYPES[game.type] ?? "Autre"}</Badge>
                {game.slug && (
                  <Badge variant="outline" className="font-mono">
                    {game.slug}
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  {enabledFeatures} fonctionnalité{enabledFeatures > 1 ? "s" : ""} active
                  {enabledFeatures > 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          <Button variant="outline" asChild>
            <Link href={`/games/${game.slug ?? game.id}`}>Voir la fiche publique</Link>
          </Button>
        </div>

        <GameTabsBar gameSlug={gameSlug} active={active} />

        {active === "identite" && <GameIdentityForm game={game} />}

        {active === "fonctionnalites" && <GameFeaturesForm game={game} />}

        {active === "deck" && (
          <div className="space-y-6">
            {game.features?.deckChecker !== true && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
                Le vérificateur de deck n&apos;est pas activé pour ce jeu : ces réglages sont
                enregistrés, mais ne serviront au contrôle des listes qu&apos;une fois la
                fonctionnalité activée depuis l&apos;onglet « Fonctionnalités ».
              </p>
            )}
            <DeckBuilderForm
              gameId={game.id}
              initialZones={zones}
              initial={game.deckBuilder}
              configured={configured}
            />
          </div>
        )}

        {active === "lieux" && (
          <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Lieux mis en avant</h2>
              <p className="text-sm text-muted-foreground">
                Les lieux poussés en tête de la fiche du jeu. La recherche ne propose que des lieux
                qui déclarent ce jeu.
              </p>
            </div>
            <FeaturedLairsManager game={game} />
          </section>
        )}

        {active === "tournois" && (
          <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Réglages de tournoi</h2>
              <p className="text-sm text-muted-foreground">
                Ce dont part une nouvelle phase pour ce jeu : preset de statistiques, départages,
                barème et catalogue de scénarios. Ils ont leur propre écran, assez fourni pour ne
                pas tenir dans un onglet.
              </p>
            </div>
            <Button variant="outline" asChild>
              <Link href={`/admin/tournaments/${game.id}`}>Ouvrir les réglages de tournoi</Link>
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}
