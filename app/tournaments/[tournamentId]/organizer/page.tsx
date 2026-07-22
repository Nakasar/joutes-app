import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getTournamentById,
  isTournamentOrganizer,
  listPhases,
  listPlayers,
} from "@/lib/db/tournaments";
import { Badge } from "@/components/ui/badge";
import { PlayerSyncQRButton } from "./PlayerSyncQRButton";

const STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

export default async function TournamentOrganizerPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) {
    notFound();
  }
  if (!isTournamentOrganizer(tournament, session.user.id)) {
    redirect("/tournaments");
  }

  const [players, phases] = await Promise.all([
    listPlayers(tournamentId),
    listPhases(tournamentId),
  ]);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground mt-1">
            Portail organisateur — {phases.length} phase(s), {players.length} joueur(s)
          </p>
        </div>
        <Badge variant="secondary">{STATUS_LABELS[tournament.status] ?? tournament.status}</Badge>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-4">Joueurs</h2>
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Joueur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Seed
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Synchronisation
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {players.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    Aucun joueur inscrit pour le moment
                  </td>
                </tr>
              ) : (
                players.map((player) => (
                  <tr key={player.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{player.displayName}</div>
                      {!player.userId && (
                        <div className="text-xs text-muted-foreground">Invité sans compte</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={player.status === "active" ? "secondary" : "outline"}>
                        {player.status === "active" ? "Actif" : "Drop"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {player.seed ?? "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <PlayerSyncQRButton
                        tournamentId={tournamentId}
                        playerName={player.displayName}
                        syncKey={player.syncKey}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
