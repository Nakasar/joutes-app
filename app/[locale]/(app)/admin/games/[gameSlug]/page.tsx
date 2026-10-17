import { Link } from "@/i18n/navigation.ts";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getGameBySlugOrId } from "@/lib/db/games.ts";
import { GAME_TYPES } from "@/lib/constants/game-types.ts";
import { GAME_FEATURE_KEYS } from "@/lib/constants/game-features.ts";
import { getDeckZones } from "@/lib/decks/zones.ts";
import {
  getDefaultBoosterTypes,
  getGameBoosterTypes,
  KNOWN_BOOSTER_TYPES,
} from "@/lib/constants/booster-types.ts";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import GameTabsBar, { readGameTab } from "./GameTabsBar.tsx";
import { GameIdentityForm } from "./GameIdentityForm.tsx";
import { GameLinksForm } from "./GameLinksForm.tsx";
import { GameFeaturesForm } from "./GameFeaturesForm.tsx";
import { DeckBuilderForm } from "./DeckBuilderForm.tsx";
import { BoosterTypesForm } from "./BoosterTypesForm.tsx";
import { GameLanguagesForm } from "./GameLanguagesForm.tsx";
import { getCatalogLanguages } from "@/lib/db/cards.ts";
import { getGameLanguages } from "@/lib/constants/card-languages.ts";
import { FeaturedLairsManager } from "../FeaturedLairsManager.tsx";
import { AdminPage } from "../../_components/AdminPage.tsx";

/**
 * La fiche d'administration d'un jeu.
 *
 * Ce que la modale d'édition tenait dans une boîte à `max-w-2xl` — identité,
 * images, fonctionnalités, lieux mis en avant — plus ce qu'elle n'aurait pas pu
 * tenir : les réglages du deck builder, le site et les réseaux de l'éditeur.
 * Chaque onglet enregistre ses seuls champs, de sorte qu'aucun n'écrase le
 * travail d'un autre.
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
  const tCollection = await getTranslations("Collection");
  const catalogLanguages = active === "langues" ? await getCatalogLanguages(game.id) : [];
  const boosterTypeDefaultLabels = Object.fromEntries(
    KNOWN_BOOSTER_TYPES.map((key) => [key, tCollection(`boosters.types.${key}`)]),
  );

  return (
    <AdminPage
      back={{ href: "/admin/games", label: "Jeux" }}
      title={
        <span className="flex items-center gap-3">
          {game.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.icon} alt="" className="size-12 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-sky-600 text-xl font-bold text-white dark:bg-sky-500">
              {game.name.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">{game.name}</span>
        </span>
      }
      description={
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{GAME_TYPES[game.type] ?? "Autre"}</Badge>
          {game.slug && (
            <Badge variant="outline" className="font-mono">
              {game.slug}
            </Badge>
          )}
          <span>
            {enabledFeatures} fonctionnalité{enabledFeatures > 1 ? "s" : ""} active
            {enabledFeatures > 1 ? "s" : ""}
          </span>
        </span>
      }
      actions={
        <Button variant="outline" asChild className="h-10">
          <Link href={`/games/${game.slug ?? game.id}`}>Voir la fiche publique</Link>
        </Button>
      }
    >
        <GameTabsBar gameSlug={gameSlug} active={active} />

        {active === "identite" && <GameIdentityForm game={game} />}

        {active === "liens" && <GameLinksForm game={game} />}

        {active === "fonctionnalites" && <GameFeaturesForm game={game} />}

        {active === "deck" && (
          <div className="space-y-6">
            {game.features?.deckChecker !== true && game.features?.decks !== true && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
                Ni les decks ni le vérificateur ne sont activés pour ce jeu : ces réglages sont
                enregistrés, mais ne serviront ni à construire ni à contrôler une liste tant que
                l&apos;une des deux fonctionnalités n&apos;est pas activée depuis l&apos;onglet
                « Fonctionnalités ».
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

        {active === "langues" && (
          <GameLanguagesForm
            gameId={game.id}
            initial={getGameLanguages(game, catalogLanguages)}
            configured={game.languages !== undefined}
            catalogLanguages={getGameLanguages(null, catalogLanguages)}
          />
        )}

        {active === "boosters" && (
          <div className="space-y-6">
            {game.features?.collection !== true && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
                La collection n&apos;est pas activée pour ce jeu : ces types sont enregistrés, mais
                la fiche du jeu ne mène pas aux boosters tant qu&apos;elle ne l&apos;est pas depuis
                l&apos;onglet « Fonctionnalités ».
              </p>
            )}
            <BoosterTypesForm
              gameId={game.id}
              initial={getGameBoosterTypes(game)}
              configured={game.boosterTypes !== undefined}
              defaults={getDefaultBoosterTypes(game.slug)}
              defaultLabels={boosterTypeDefaultLabels}
            />
          </div>
        )}

        {active === "lieux" && (
          <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
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
          <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
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
    </AdminPage>
  );
}
