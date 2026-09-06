import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { buildFormResponseRows } from "@/lib/tournaments/form-export.ts";
import { loadOrganizerContext } from "../../organizerContext.ts";
import { OrganizerPageHeader } from "../../OrganizerPageHeader.tsx";
import { TableSectionSkeleton } from "../../OrganizerSkeletons.tsx";
import { FormResponsesTable, type ResponseRow } from "./FormResponsesTable.tsx";

type Params = Promise<{ tournamentId: string }>;

export default function OrganizerFormResponsesPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="p-6"><TableSectionSkeleton rows={10} columns={4} /></div>}>
      <OrganizerFormResponsesPageSection params={params} />
    </Suspense>
  );
}

/**
 * Toutes les réponses au formulaire d'inscription, d'un coup d'œil : une ligne
 * par joueur, une colonne par question. La fiche de chaque joueur reste le
 * lieu de la correction ; ici on lit, on cherche, on exporte.
 */
async function OrganizerFormResponsesPageSection({ params }: { params: Params }) {
  const { tournamentId } = await params;
  const t = await getTranslations("Tournaments");
  const { tournament, players } = await loadOrganizerContext(tournamentId);

  const form = tournament.registrationForm;
  if (!form || form.fields.length === 0) {
    return (
      <div className="p-6">
        <OrganizerPageHeader title={t("form.responses.title")} />
        <p className="text-sm text-muted-foreground">{t("form.responses.noForm")}</p>
      </div>
    );
  }

  const rows: ResponseRow[] = buildFormResponseRows(form, players, {
    decklistCount: (count) => t("form.decklistCount", { count }),
    unrecognized: (count) => t("form.decklistUnrecognized", { count }),
    banned: (count) => t("form.decklistBanned", { count }),
    parseError: t("form.responses.parseError"),
  }).map((row) => ({
    ...row,
    answeredAt: row.answeredAt?.toISOString(),
  }));

  return (
    <div className="p-6">
      <FormResponsesTable
        tournamentId={tournamentId}
        fields={form.fields.map((field) => ({ id: field.id, label: field.label, type: field.type }))}
        rows={rows}
      />
    </div>
  );
}
