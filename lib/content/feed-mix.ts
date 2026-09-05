/**
 * Choisir les quelques entrées qu'un fil montre, sans qu'une source mange tout.
 *
 * Le fil de l'accueil est chronologique et ne garde que six entrées. Cela
 * marchait tant que ses sources publiaient au même rythme : une actualité par
 * semaine, un deck de temps en temps. Les publications rapatriées des réseaux
 * d'un éditeur changent l'échelle — un compte actif poste plusieurs fois par
 * jour, et un tri par date seul lui donnerait les six places une bonne partie
 * du temps, en repoussant tout le reste hors de l'écran.
 *
 * D'où un plafond par genre. Mais un plafond **sec** créerait un défaut
 * inverse : un jeu qui n'a ni actualité ni deck récent afficherait deux
 * vignettes et quatre trous, ce qui ressemble à une panne plutôt qu'à une
 * règle.
 *
 * La règle est donc en deux temps, et c'est tout l'objet de ce module :
 *
 * 1. **le plafond d'abord** — on parcourt les entrées dans l'ordre et on saute
 *    celles dont le genre a fait le plein ;
 * 2. **le remplissage ensuite** — s'il reste des places qu'aucune autre source
 *    ne peut prendre, on y remet les sautées, toujours dans l'ordre.
 *
 * Le plafond borne donc la place qu'un genre prend **face aux autres**, pas la
 * place qu'il occupe dans l'absolu. C'est ce qu'on veut dire par « les
 * publications ne doivent pas noyer le fil », et non « le fil doit rester à
 * moitié vide ».
 *
 * Pur, donc testé (`feed-mix.test.ts`).
 */

export type FeedMixOptions<K extends string> = {
  /** Combien d'entrées le fil montre en tout. */
  max: number;
  /**
   * Le plafond de chaque genre, quand il en a un.
   *
   * Un genre absent de la table n'est pas plafonné. Un plafond de zéro écarte
   * le genre du premier temps, mais **pas du remplissage** — pour l'exclure
   * vraiment, il faut le filtrer avant d'appeler.
   */
  caps?: Partial<Record<K, number>>;
};

/**
 * Les entrées retenues, dans l'ordre reçu.
 *
 * L'ordre d'entrée est celui de sortie : ce module ne trie pas, il choisit.
 * Le tri chronologique appartient à l'appelant, qui seul sait sur quel champ.
 *
 * Le genre se déduit des **entrées**, jamais de la table de plafonds : un
 * paramètre de type libre ferait inférer le genre depuis `caps`, si bien que
 * `{ social: 2 }` ferait refuser une liste portant d'autres genres. Le lier à
 * `T["type"]` fait partir l'inférence de ce qu'on trie, et la table n'est plus
 * qu'un sous-ensemble.
 */
export function selectFeedEntries<T extends { type: string }>(
  entries: T[],
  { max, caps }: FeedMixOptions<T["type"]>,
): T[] {
  if (max <= 0) {
    return [];
  }

  const retenues: T[] = [];
  const reportees: T[] = [];
  const comptes = new Map<T["type"], number>();

  for (const entree of entries) {
    if (retenues.length >= max) {
      break;
    }

    const plafond = caps?.[entree.type as T["type"]];
    const compte = comptes.get(entree.type) ?? 0;

    if (plafond !== undefined && compte >= plafond) {
      reportees.push(entree);
      continue;
    }

    comptes.set(entree.type, compte + 1);
    retenues.push(entree);
  }

  // Les places qu'aucune autre source n'a pu prendre reviennent aux sautées,
  // dans leur ordre d'origine. Sans ce second temps, un fil dont une seule
  // source publie afficherait deux entrées et quatre trous.
  for (const entree of reportees) {
    if (retenues.length >= max) {
      break;
    }

    retenues.push(entree);
  }

  /*
   * Le remplissage a pu casser l'ordre : une entrée reportée est réinsérée à la
   * fin, alors qu'elle précédait peut-être celles retenues au premier temps. On
   * rétablit donc l'ordre d'origine, que l'appelant a établi et sur lequel il
   * compte.
   */
  const rang = new Map(entries.map((entree, index) => [entree, index]));

  return retenues.sort((a, b) => (rang.get(a) ?? 0) - (rang.get(b) ?? 0));
}
