/** Les refus d'un deck que la page sait dire dans sa langue ; les autres sont des phrases du moteur. */
const KNOWN = new Set(["noLegend", "noChampion", "unknownCard"]);

export function deckProblemText(t: (key: string) => string, problem: string): string {
  return KNOWN.has(problem) ? t(`deck.problem.${problem}`) : problem;
}

/** Un message d'erreur suivi des refus du deck, s'il y en a. */
export function withDeckProblems(t: (key: string) => string, message: string, details: string[] | undefined): string {
  return details?.length ? `${message} ${details.map((detail) => deckProblemText(t, detail)).join(" ")}` : message;
}
