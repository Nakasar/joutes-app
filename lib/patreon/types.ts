/**
 * Les formes JSON:API que Patreon renvoie, réduites à ce qu'on en lit.
 *
 * Volontairement permissives : `unknown` plutôt que des champs obligatoires
 * partout où Patreon peut légitimement omettre quelque chose. Une charge utile
 * inattendue doit produire « aucun palier » et non une exception — la seule
 * chose qu'on ne s'autorise jamais, c'est de conclure à une extinction
 * d'abonnement à cause d'une réponse qu'on n'a pas su lire.
 */

export type PatreonResourceIdentifier = {
  id: string;
  type: string;
};

export type PatreonResource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<
    string,
    { data?: PatreonResourceIdentifier | PatreonResourceIdentifier[] | null } | undefined
  >;
};

export type PatreonDocument = {
  data?: PatreonResource | PatreonResource[] | null;
  included?: PatreonResource[];
};

export type PatreonPatronStatus = "active_patron" | "declined_patron" | "former_patron";

/**
 * Ce qu'on retient d'une adhésion, une fois la charge utile démêlée.
 *
 * C'est la seule forme qui circule ensuite : ni `sync.ts`, ni la base, ni
 * l'interface ne connaissent JSON:API.
 */
export type MembershipSnapshot = {
  patreonUserId: string | null;
  memberId: string | null;
  entitledTierIds: string[];
  entitledAmountCents: number;
  patronStatus: PatreonPatronStatus | null;
  lastChargeStatus: string | null;
};

export const EMPTY_SNAPSHOT: Omit<MembershipSnapshot, "patreonUserId" | "memberId"> = {
  entitledTierIds: [],
  entitledAmountCents: 0,
  patronStatus: null,
  lastChargeStatus: null,
};
