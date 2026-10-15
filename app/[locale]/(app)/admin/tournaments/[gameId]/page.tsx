import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getGameById } from "@/lib/db/games.ts";
import { GENERIC_TIEBREAKERS } from "@/lib/types/Tournament.ts";
import { presetOptionsForGame } from "@/lib/tournaments/game-defaults.ts";
import { defaultPresetForGameSlug } from "@/lib/tournaments/game-presets.ts";
import { GameTournamentDefaultsForm } from "../GameTournamentDefaultsForm.tsx";
import { AdminPage } from "../../_components/AdminPage.tsx";

/**
 * Réglages de tournoi d'un jeu.
 *
 * Les libellés des critères de départage et des statistiques sont ceux que
 * l'organisateur lit dans son formulaire de phase : ils existent déjà dans les
 * quatre langues, et un administrateur qui règle « score de bataille » doit
 * retrouver le même mot à l'écran de configuration d'un tournoi.
 */
export default async function AdminGameTournamentPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  await requireAdmin();

  const { gameId } = await params;
  // Un identifiant mal formé fait lever `getGameById` (ObjectId invalide) :
  // c'est une URL saisie à la main, elle mérite un 404, pas une erreur serveur.
  const game = await (async () => {
    try {
      return await getGameById(gameId);
    } catch {
      return null;
    }
  })();
  if (!game) notFound();

  const t = await getTranslations("Tournaments");

  const presets = presetOptionsForGame(game.slug, game.tournamentDefaults).map((preset) => ({
    key: preset.key,
    label: t(`matchStats.presets.${preset.labelKey}`),
    stats: preset.stats.map((stat) => ({
      key: stat.key,
      label: t(`matchStats.stats.${stat.labelKey}`),
    })),
    tiebreakers: preset.tiebreakers,
    defaults: {
      fixedScoring: preset.defaults.fixedScoring,
      swissPairing: preset.defaults.swissPairing,
      bestOf: preset.defaults.bestOf,
      resultMode: preset.defaults.resultMode,
      requireStats: preset.defaults.requireStats,
    },
  }));

  // Preset que le catalogue retient d'office pour ce jeu, indépendamment du
  // réglage en cours : c'est ce que veut dire « suivre le jeu » au sélecteur.
  const shippedPreset = defaultPresetForGameSlug(game.slug);

  return (
    <AdminPage
      title={game.name}
      description={
        <p>
          Ce dont part une nouvelle phase de tournoi pour ce jeu. Chaque réglage laissé tel
          quel suit le format livré avec la plateforme, et continuera de le suivre s&apos;il
          évolue.
        </p>
      }
      back={{ href: "/admin/tournaments", label: "Réglages de tournoi" }}
      width="narrow"
    >
      {game.features?.tournaments !== true && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Les tournois ne sont pas activés pour ce jeu : ces réglages sont enregistrés, mais
          ne s&apos;appliqueront qu&apos;une fois la fonctionnalité activée depuis la fiche du
          jeu.
        </p>
      )}

      <GameTournamentDefaultsForm
        gameId={game.id}
        initial={game.tournamentDefaults}
        presets={presets}
        shippedPresetKey={shippedPreset?.key}
        genericTiebreakers={GENERIC_TIEBREAKERS.map((key) => ({
          key,
          label: t(`organizerPhases.tiebreakerNames.${key}`),
        }))}
      />
    </AdminPage>
  );
}
