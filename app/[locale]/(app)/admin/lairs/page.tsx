import { LairForm } from "./LairForm.tsx";
import { LairList, type LairAgendaSummary } from "./LairList.tsx";
import { AdminPage } from "../_components/AdminPage.tsx";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getAllLairs, getLairsAdminHealth, type LairAdminHealth } from "@/lib/db/lairs.ts";
import { getAllGames } from "@/lib/db/games.ts";
import type { Lair } from "@/lib/types/Lair.ts";

/** Résume l'état de l'agenda d'un lieu pour la liste (cf. `LairAgendaState`). */
function summarizeAgenda(lair: Lair, health: LairAdminHealth | undefined): LairAgendaSummary {
  const sources = lair.eventsSourceUrls?.length ?? 0;
  const refresh = health?.refresh ?? null;
  const failed = refresh?.sources.find((source) => !source.ok);
  const base = {
    sources,
    refreshedAt: refresh?.at,
    found: refresh?.sources.reduce((total, source) => total + source.count, 0),
  };

  if (health?.helpRequested) return { ...base, state: "help" };
  if (failed) return { ...base, state: "failing", error: failed.error };
  if (sources === 0) return { ...base, state: "manual" };
  if (!refresh) return { ...base, state: "pending" };
  return { ...base, state: "ok" };
}

export default async function AdminLairsPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  await requireAdmin();

  const [{ etat }, lairs, games, health] = await Promise.all([
    searchParams,
    getAllLairs(),
    getAllGames(),
    getLairsAdminHealth(),
  ]);

  const agendas = Object.fromEntries(lairs.map((lair) => [lair.id, summarizeAgenda(lair, health.get(lair.id))]));

  return (
    <AdminPage
      title="Lieux"
      description={`${lairs.length} lieu${lairs.length > 1 ? "x" : ""} dans l'annuaire, privés compris.`}
      actions={<LairForm games={games} />}
      width="wide"
    >
      <LairList
        lairs={lairs}
        games={games}
        agendas={agendas}
        initialFilter={etat === "a-surveiller" ? "attention" : "all"}
      />
    </AdminPage>
  );
}
