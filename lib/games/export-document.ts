/**
 * Sérialisation du document d'export d'un jeu, morceau par morceau.
 *
 * Le document garde exactement la forme qu'attendent les clients hors ligne
 * (`{ game, generatedAt, cards, erratas, policies, rules }`), mais il n'est
 * jamais assemblé en mémoire : les cartes arrivent d'un curseur et repartent
 * aussitôt vers le stockage. Un jeu à cent mille cartes pèse une soixantaine de
 * mégaoctets une fois écrit ; les matérialiser tous — objets, chaîne JSON puis
 * tampon d'octets — en coûtait six fois plus, tout en même temps.
 *
 * Module pur, sans base ni flux : c'est la grammaire du document, pas son
 * transport. Un JSON malformé ici casserait silencieusement le téléchargement
 * de tous les clients, d'où les tests.
 */

/** Sources du document. Les cartes sont asynchrones : elles viennent d'un curseur. */
export type GameExportSource = {
  game: { id: string; slug?: string; name: string };
  generatedAt: Date;
  cards: AsyncIterable<unknown>;
  erratas: Iterable<unknown>;
  policies: Iterable<unknown>;
  /** Règles brutes, absentes pour les jeux qui n'en publient pas. */
  rules?: unknown;
};

/**
 * Fragments JSON du document, dans l'ordre d'écriture. Leur concaténation est
 * le document complet ; aucun fragment ne dépend du suivant, ce qui permet de
 * les pousser dans un flux au fil de leur production.
 */
export async function* gameExportChunks(source: GameExportSource): AsyncGenerator<string> {
  const header = {
    id: source.game.id,
    slug: source.game.slug,
    name: source.game.name,
  };

  yield `{"game":${JSON.stringify(header)}`;
  yield `,"generatedAt":${JSON.stringify(source.generatedAt.toISOString())}`;

  yield `,"cards":[`;
  let firstCard = true;
  for await (const card of source.cards) {
    yield firstCard ? JSON.stringify(card) : `,${JSON.stringify(card)}`;
    firstCard = false;
  }
  yield `]`;

  // Erratas et policies restent chargés d'un bloc par leurs accesseurs : leur
  // volume est borné par jeu, sans commune mesure avec les cartes. Ils sont
  // tout de même sérialisés élément par élément, pour ne pas reconstituer une
  // grande chaîne intermédiaire au moment de les écrire.
  yield `,"erratas":[`;
  let firstErrata = true;
  for (const errata of source.erratas) {
    yield firstErrata ? JSON.stringify(errata) : `,${JSON.stringify(errata)}`;
    firstErrata = false;
  }
  yield `]`;

  yield `,"policies":[`;
  let firstPolicy = true;
  for (const policy of source.policies) {
    yield firstPolicy ? JSON.stringify(policy) : `,${JSON.stringify(policy)}`;
    firstPolicy = false;
  }
  yield `]`;

  // `rules` absent est omis plutôt qu'écrit à null : c'est ce que produisait la
  // sérialisation d'un objet dont la propriété vaut `undefined`, et les clients
  // déjà déployés lisent le champ comme optionnel.
  if (source.rules !== undefined) {
    yield `,"rules":${JSON.stringify(source.rules)}`;
  }

  yield `}`;
}
