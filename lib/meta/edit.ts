import { formatPlacement } from "./import-input.ts";

/** Ce que la gestion de la méta peut changer d'un deck méta. */
export type MetaDeckEdit = {
  source: string;
  eventDate: Date;
  placement?: string;
  /** Le nom et le joueur ne changent que pour un deck importé : un deck marqué reste celui de son joueur. */
  name?: string;
  pilot?: string;
};

type CurrentMetaDeck = {
  name: string;
  description?: string;
  meta: { imported: boolean; source: string; placement?: string; pilot?: string };
};

/** La description qu'un import donne à un deck : « Liste relevée à X, classée 1er, jouée par Y. » */
export function metaDeckDescription(details: { source: string; placement?: string; pilot?: string }): string {
  return [
    `Liste relevée à ${details.source}`,
    details.placement ? `classée ${details.placement}` : undefined,
    details.pilot ? `jouée par ${details.pilot}` : undefined,
  ]
    .filter(Boolean)
    .join(", ")
    .concat(".");
}

export type MetaDeckEditPlan = {
  $set: Record<string, unknown>;
  $unset: Record<string, "">;
  /** Le nouveau nom, quand il change : il doit rester libre parmi les decks du compte. */
  rename?: string;
};

/**
 * Les champs à écrire pour une modification.
 *
 * Un deck importé suit sa description générée tant qu'on ne l'a pas réécrite
 * à la main ; un deck marqué garde son nom, son joueur et sa description.
 */
export function planMetaDeckEdit(current: CurrentMetaDeck, edit: MetaDeckEdit): MetaDeckEditPlan {
  // Un champ absent garde sa valeur ; seule une chaîne vide l'efface.
  const placement = edit.placement === undefined ? current.meta.placement : formatPlacement(edit.placement);
  const $set: Record<string, unknown> = { "meta.source": edit.source.trim(), "meta.eventDate": edit.eventDate };
  const $unset: Record<string, ""> = {};

  if (edit.placement !== undefined) {
    if (placement) $set["meta.placement"] = placement;
    else $unset["meta.placement"] = "";
  }

  if (!current.meta.imported) return { $set, $unset };

  const pilot = edit.pilot === undefined ? current.meta.pilot : edit.pilot.trim() || undefined;
  if (edit.pilot !== undefined) {
    if (pilot) $set["meta.pilot"] = pilot;
    else $unset["meta.pilot"] = "";
  }

  const generated = metaDeckDescription(current.meta);
  if (!current.description || current.description === generated) {
    $set.description = metaDeckDescription({ source: edit.source.trim(), placement, pilot });
  }

  const name = edit.name?.trim();
  const rename = name && name !== current.name ? name : undefined;
  if (rename) $set.name = rename;

  return { $set, $unset, ...(rename ? { rename } : {}) };
}
