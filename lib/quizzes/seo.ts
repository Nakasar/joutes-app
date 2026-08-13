import type { QuizBlock } from "@/lib/types/Quiz";

/**
 * Description d'un quizz pour les moteurs et les partages.
 *
 * Un quizz n'a pas de champ « description » : ce qu'il a de mieux à dire de
 * lui-même, c'est son introduction — le bloc de texte que l'auteur écrit avant
 * la première question, où il annonce ce qu'il va demander. C'est cette
 * introduction qu'on résume, plutôt qu'une phrase générique qui décrirait aussi
 * bien tous les autres.
 *
 * Module pur, sans accès à la base ni au DOM : c'est ce qui le rend testable.
 */

/** Longueur d'une méta-description avant que les moteurs ne la coupent. */
export const MAX_META_DESCRIPTION_LENGTH = 160;

/**
 * Retire le balisage d'un texte Markdown pour n'en garder que les mots.
 *
 * Une méta-description est du texte brut : les dièses d'un titre, les
 * astérisques d'un gras ou la cible d'un lien y seraient lus tels quels, et
 * mangeraient la place des mots qui portent le sens.
 */
function stripMarkdown(markdown: string): string {
  return (
    markdown
      // Les blocs de code ne décrivent rien : ils partent en entier.
      .replace(/```[\s\S]*?```/g, " ")
      // Une image n'a pas de texte à donner, son texte alternatif décrit
      // l'image et non le quizz.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      // D'un lien, on garde le texte visible et on jette l'adresse.
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Marqueurs de titre, de citation et de liste, en début de ligne.
      .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
      // Emphase et code en ligne : les marques tombent, le texte reste.
      .replace(/[*_~`]/g, "")
      // Les traits de séparation ne sont pas des mots.
      .replace(/^\s*[-=]{3,}\s*$/gm, " ")
      // Une balise HTML égarée dans du Markdown.
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Coupe au dernier mot entier qui tient, et marque la coupure. Couper au milieu
 * d'un mot donnerait une description qui a l'air tronquée par accident.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  // Un mot plus long que la limite entière : mieux vaut le couper que ne rien
  // rendre du tout.
  const kept = lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut;

  return `${kept.replace(/[\s,;:.]+$/, "")}…`;
}

/**
 * Introduction d'un quizz, résumée en une description. Rend `null` quand le
 * quizz entre dans le vif du sujet sans un mot d'introduction : l'appelant
 * retombe alors sur une phrase traduite, qui décrit au moins ce qu'est un
 * quizz.
 *
 * Seuls les blocs de texte **avant la première question** sont lus : le texte
 * qui suit commente les réponses, et le donner en description dévoilerait ce
 * que le quizz demande.
 */
export function quizIntroDescription(
  blocks: QuizBlock[] | undefined,
  maxLength = MAX_META_DESCRIPTION_LENGTH
): string | null {
  const intro: string[] = [];

  for (const block of blocks ?? []) {
    if (block.type !== "markdown") break;
    const text = stripMarkdown(block.content ?? "");
    if (text) intro.push(text);
  }

  const description = intro.join(" ").trim();
  return description ? truncate(description, maxLength) : null;
}
