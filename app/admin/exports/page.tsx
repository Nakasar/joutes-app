import { getAllGames } from "@/lib/db/games";
import { Game } from "@/lib/types/Game";
import { getLatestGameExports, GameExport } from "@/lib/db/game-exports";
import { DeleteExportButton } from "./DeleteExportButton";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export default async function AdminExportsPage() {
  const [games, exports] = await Promise.all([getAllGames(), getLatestGameExports()]);

  const exportByGameId = new Map(exports.map((e) => [e.gameId, e]));
  const gamesById = new Map(games.map((g) => [g.id, g]));

  type ExportRow = { game: Game | undefined; export: GameExport | undefined };

  const gameRows: ExportRow[] = games.map((game) => ({ game, export: exportByGameId.get(game.id) }));
  const orphanRows: ExportRow[] = exports
    .filter((e) => !gamesById.has(e.gameId))
    .map((e) => ({ game: undefined, export: e }));

  const rows: ExportRow[] = [...gameRows, ...orphanRows];

  return (
    <div className="bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Exports de données</h1>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Jeu
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Généré le
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Taille
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                    Aucun export pour le moment
                  </td>
                </tr>
              ) : (
                rows.map(({ game, export: gameExport }) => (
                  <tr key={game?.id ?? gameExport?.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {game?.name ?? "Jeu supprimé"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {gameExport
                        ? new Date(gameExport.generatedAt).toLocaleString("fr-FR")
                        : "Jamais exporté"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {gameExport ? formatSize(gameExport.size) : "—"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      {gameExport && (
                        <div className="flex gap-4 justify-end">
                          <a
                            href={gameExport.url}
                            download
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Télécharger
                          </a>
                          <DeleteExportButton id={gameExport.id} />
                        </div>
                      )}
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
