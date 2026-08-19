import { Link } from "@/i18n/navigation.ts";
import { getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { Button } from "@/components/ui/button.tsx";
import { resolveGameTournamentDefaults } from "@/lib/tournaments/game-defaults.ts";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

/**
 * Réglages de tournoi des jeux : la liste, et l'état de chacun.
 *
 * Les jeux qui ouvrent les tournois passent devant — ce sont ceux dont les
 * réglages servent. Les autres restent joignables : activer la fonctionnalité
 * et la régler sont deux gestes, et rien n'oblige à les faire dans cet ordre.
 */
export default async function AdminTournamentsPage() {
  await requireAdmin();

  const games = await getAllGames();
  const t = await getTranslations("Tournaments");

  const rows = games
    .map((game) => {
      const resolved = resolveGameTournamentDefaults(game.slug, game.tournamentDefaults);
      return {
        id: game.id,
        name: game.name,
        icon: game.icon,
        slug: game.slug,
        tournamentsEnabled: game.features?.tournaments === true,
        configured: game.tournamentDefaults !== undefined,
        presetLabel: resolved.preset
          ? t(`matchStats.presets.${resolved.preset.labelKey}`)
          : "Aucune statistique",
        tiebreakerCount: resolved.tiebreakers.length,
        scenarioCount: resolved.scenarios.length,
      };
    })
    .sort((a, b) => {
      if (a.tournamentsEnabled !== b.tournamentsEnabled) return a.tournamentsEnabled ? -1 : 1;
      return a.name.localeCompare(b.name, "fr");
    });

  return (
    <div className="bg-muted/50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">Réglages de tournoi</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ce qu&apos;un tournoi de chaque jeu applique par défaut : statistiques relevées,
            ordre de départage, barème et scénarios proposés. Les organisateurs partent de ces
            réglages et restent libres de les modifier tournoi par tournoi.
          </p>
        </div>

        <div className="bg-card rounded-lg shadow-md overflow-x-auto">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Jeu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Statistiques
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Départages
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Scénarios
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-muted-foreground">
                    Aucun jeu pour le moment
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className={row.tournamentsEnabled ? "" : "opacity-60"}>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-3">
                        {row.icon ? (
                          <img src={row.icon} alt="" className="h-8 w-8 rounded object-cover" />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted flex items-center justify-center text-muted-foreground">
                            {row.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-foreground">{row.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.tournamentsEnabled ? "Tournois activés" : "Tournois désactivés"}
                            {row.configured ? " · réglé" : " · réglages du jeu"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">{row.presetLabel}</td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {row.tiebreakerCount === 0
                        ? "Aucun"
                        : `${row.tiebreakerCount} critère${row.tiebreakerCount > 1 ? "s" : ""}`}
                    </td>
                    <td className="px-6 py-4 text-sm text-foreground">
                      {row.scenarioCount === 0 ? "—" : row.scenarioCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/tournaments/${row.id}`}>Configurer</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
