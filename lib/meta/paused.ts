/**
 * Interrupteur de la méta (2026-11-24).
 *
 * La méta coûtait trop cher à servir : un scraper distribué (IP résidentielles,
 * agent de navigateur, donc invisible pour `lib/net/meta-bots.ts`) y envoyait
 * jusqu'à 75 000 requêtes par jour, et chacune relançait le rendu (~23 GB-h et
 * ~12 Go de transfert par jour sur Vercel). Kevin a choisi de la couper pour
 * tout le monde en attendant d'en optimiser le calcul.
 *
 * Tant que `META_PAUSED` est vrai :
 * - le proxy répond « Bientôt de retour... » sur `/games/:jeu/meta…`, avant
 *   tout rendu (`metaPausedPage`) ;
 * - les pages de méta (jeu, tournoi, joueur, groupe) affichent le même message
 *   si elles sont atteintes autrement ;
 * - les routes REST de la méta répondent 503 `code: "PAUSED"` ;
 * - les outils MCP de lecture de la méta répondent « Bientôt de retour... » ;
 * - l'encart méta de l'email hebdomadaire n'est pas calculé.
 *
 * La gestion (`/decks/meta/manage`, outil `import_meta_decks`) reste ouverte :
 * les imports continuent pour la réouverture. Rouvrir = passer à `false`.
 */
export const META_PAUSED = true;

export const META_PAUSED_MESSAGE = "Bientôt de retour...";

/** Le corps des routes REST de la méta tant qu'elle est coupée. */
export const META_PAUSED_BODY = { error: META_PAUSED_MESSAGE, code: "PAUSED" } as const;

/** La page servie par le proxy : du HTML seul, sans rendu ni base. */
export function metaPausedPage(): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Méta – ${META_PAUSED_MESSAGE} – Joutes</title>
<style>
:root{color-scheme:light dark;--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--accent:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--accent:#f59e0b}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--fg);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px;box-sizing:border-box}
main{max-width:28rem;text-align:center}
h1{font-size:1.75rem;margin:0 0 .5rem}
p{color:var(--muted);line-height:1.5;margin:0 0 1.5rem}
a{color:var(--accent);font-weight:600}
</style>
</head>
<body>
<main>
<h1>${META_PAUSED_MESSAGE}</h1>
<p>La méta des decks est en pause le temps de l'améliorer.</p>
<a href="/">Retour à Joutes</a>
</main>
</body>
</html>`;
}
