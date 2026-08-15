import test from "node:test";
import assert from "node:assert/strict";
import {
  absoluteUrl,
  collectMarkdownImageUrls,
  extractArticle,
  rewriteMarkdownImageUrls,
} from "@/lib/news/article-extraction";

const PAGE_URL = "https://exemple.com/fr-fr/news/faq-vendetta/";

/** Une page d'article réaliste : métadonnées, habillage, et le corps au milieu. */
function pageWith(body: string, head = ""): string {
  return `<!doctype html><html lang="fr"><head>
    <title>FAQ Vendetta | Exemple</title>
    <meta property="og:site_name" content="Riftbound">
    <meta property="og:title" content="FAQ et clarifications sur des règles de Vendetta">
    <meta property="og:description" content="Réponses à des questions fréquentes.">
    <meta property="og:image" content="/images/banniere.jpg">
    ${head}
  </head><body>
    <nav class="site-nav"><a href="/a">Accueil</a><a href="/b">Cartes</a><a href="/c">Decks</a></nav>
    <main>
      <h1>FAQ et clarifications sur des règles de Vendetta</h1>
      ${body}
    </main>
    <section id="related-articles"><h2>Articles liés</h2><a href="/x">Un autre article publié la semaine dernière</a></section>
    <footer><a href="/legal">Mentions légales du site, conditions et vie privée</a></footer>
  </body></html>`;
}

const ARTICLE_BODY = `<div class="richText">
  <p>Bienvenue dans la FAQ de Vendetta, qui rassemble les questions posées par les joueurs et les arbitres.</p>
  <ul>
    <li>[E] signifie « épuiser », et se lit sur la plupart des unités du set</li>
    <li>[M] signifie « puissance », une valeur que beaucoup de sorts modifient</li>
  </ul>
  <hr>
  <p><img src="/images/abandon.jpg" width="1848" height="1063"></p>
  <p><strong>Que se passe-t-il lorsque vous jouez Abandon sur un sort de Flux&nbsp;?</strong></p>
  <p>Il sera banni lorsqu'il tentera de quitter la chaîne, quelle que soit la manière dont cela arrive.</p>
  <blockquote>Règles pertinentes : 359 et suivantes, dans le document des règles de base.</blockquote>
</div>`;

test("extractArticle tire le titre, le résumé, la bannière et la source des métadonnées", () => {
  const article = extractArticle(pageWith(ARTICLE_BODY), PAGE_URL);

  assert.ok(article);
  assert.equal(article.title, "FAQ et clarifications sur des règles de Vendetta");
  assert.equal(article.summary, "Réponses à des questions fréquentes.");
  assert.equal(article.sourceName, "Riftbound");
  assert.equal(article.bannerUrl, "https://exemple.com/images/banniere.jpg");
});

test("extractArticle garde la mise en page de l'article", () => {
  const article = extractArticle(pageWith(ARTICLE_BODY), PAGE_URL);

  assert.ok(article);
  assert.match(article.markdown, /^Bienvenue dans la FAQ de Vendetta/);
  assert.match(article.markdown, /^- \[E\] signifie/m);
  assert.match(article.markdown, /^---$/m);
  assert.match(article.markdown, /\*\*Que se passe-t-il/);
  assert.match(article.markdown, /^> Règles pertinentes/m);
});

test("extractArticle laisse les crochets intacts, pour l'annotation à l'affichage", () => {
  const article = extractArticle(pageWith(ARTICLE_BODY), PAGE_URL);

  assert.ok(article);
  // `annotateErrataMarkdown` lit `[E]` et `[M]` pour en faire des icônes :
  // un `\[` échappé par le convertisseur les rendrait en texte brut.
  assert.ok(!article.markdown.includes("\\["));
  assert.ok(article.markdown.includes("[E]"));
});

test("extractArticle écarte la navigation, les articles liés et le pied de page", () => {
  const article = extractArticle(pageWith(ARTICLE_BODY), PAGE_URL);

  assert.ok(article);
  assert.ok(!article.markdown.includes("Mentions légales"));
  assert.ok(!article.markdown.includes("Articles liés"));
  assert.ok(!article.markdown.includes("Decks"));
});

test("extractArticle ne répète pas le titre dans le corps", () => {
  const article = extractArticle(pageWith(ARTICLE_BODY), PAGE_URL);

  assert.ok(article);
  assert.ok(!article.markdown.includes("FAQ et clarifications sur des règles de Vendetta"));
});

test("extractArticle rend les adresses d'images et de liens absolues", () => {
  const body = ARTICLE_BODY.replace(
    "</div>",
    `<p>Voir <a href="/fr-fr/rules/">les règles complètes</a> pour le détail de chaque cas évoqué ici.</p></div>`
  );
  const article = extractArticle(pageWith(body), PAGE_URL);

  assert.ok(article);
  assert.ok(article.markdown.includes("https://exemple.com/images/abandon.jpg"));
  assert.ok(article.markdown.includes("https://exemple.com/fr-fr/rules/"));
});

test("extractArticle garde les blocs voisins du corps, texte comme illustration", () => {
  // Un article est presque toujours découpé en blocs : du texte, une image,
  // du texte. Ne garder que le mieux noté le couperait au premier bloc.
  const body = `
    <div class="rich-text"><p>Le premier bloc de l'article, assez long pour être reconnu comme le corps, avec plusieurs virgules, et des phrases.</p></div>
    <div class="image-block"><img src="/images/milieu.jpg" alt="au milieu"></div>
    <div class="rich-text"><p>Un deuxième bloc de prose, tout aussi long que le premier, qui doit lui aussi finir dans le brouillon importé.</p></div>`;

  const article = extractArticle(pageWith(body), PAGE_URL);

  assert.ok(article);
  assert.ok(article.markdown.includes("Le premier bloc"));
  assert.ok(article.markdown.includes("https://exemple.com/images/milieu.jpg"));
  assert.ok(article.markdown.includes("Un deuxième bloc"));
});

test("extractArticle suit les images paresseuses et jette les pixels de suivi", () => {
  const body = `<div class="richText">
    <p>Un paragraphe assez long pour compter comme du contenu rédigé dans la notation.</p>
    <p><img data-src="/images/tardive.png" alt="tardive"></p>
    <p><img srcset="/images/petite.png 400w, /images/grande.png 1600w" alt="variantes"></p>
    <p><img src="/pixel.gif" width="1" height="1" alt=""></p>
  </div>`;
  const article = extractArticle(pageWith(body), PAGE_URL);

  assert.ok(article);
  assert.ok(article.markdown.includes("https://exemple.com/images/tardive.png"));
  assert.ok(article.markdown.includes("https://exemple.com/images/grande.png"));
  assert.ok(!article.markdown.includes("petite.png"));
  assert.ok(!article.markdown.includes("pixel.gif"));
});

test("extractArticle se rabat sur le début de l'article quand la page ne déclare pas de résumé", () => {
  const page = `<!doctype html><html><head><title>Sans résumé</title></head><body><main><article class="post-content">
    <p><img src="/images/tete.jpg"></p>
    <p>La première phrase de l'article, qui devra servir de résumé faute de mieux dans les métadonnées.</p>
  </article></main></body></html>`;

  const article = extractArticle(page, PAGE_URL);

  assert.ok(article);
  assert.ok(article.summary.startsWith("La première phrase"));
  assert.ok(!article.summary.includes("!["));
});

test("extractArticle se rabat sur le nom de domaine quand le site ne se nomme pas", () => {
  const page = `<!doctype html><html><head><title>Rien</title></head><body><main><article>
    <p>Un paragraphe suffisamment long pour que ce bloc soit reconnu comme le corps de l'article.</p>
  </article></main></body></html>`;

  const article = extractArticle(page, "https://www.exemple.com/a/b");

  assert.ok(article);
  assert.equal(article.sourceName, "exemple.com");
});

test("extractArticle rend undefined quand la page ne porte pas d'article", () => {
  const page = `<!doctype html><html><head><title>Menu</title></head><body>
    <nav><a href="/a">Un</a><a href="/b">Deux</a></nav>
  </body></html>`;

  assert.equal(extractArticle(page, PAGE_URL), undefined);
});

test("extractArticle tronque un titre trop long pour le schéma des actualités", () => {
  const longTitle = "Vendetta ".repeat(40).trim();
  const article = extractArticle(
    pageWith(ARTICLE_BODY, `<meta name="twitter:title" content="${longTitle}">`),
    PAGE_URL
  );

  assert.ok(article);
  // Le titre vient d'`og:title` ici ; on vérifie plutôt la borne sur une page
  // qui n'a que le titre long.
  const onlyLong = extractArticle(
    `<!doctype html><html><head><title>${longTitle}</title></head><body><main><article><p>Un paragraphe assez long pour être compté comme du contenu rédigé.</p></article></main></body></html>`,
    PAGE_URL
  );
  assert.ok(onlyLong);
  assert.ok(onlyLong.title.length <= 200);
  assert.ok(onlyLong.title.endsWith("…"));
});

test("absoluteUrl écarte ce qui n'est pas une ressource http(s)", () => {
  assert.equal(absoluteUrl("/a/b", PAGE_URL), "https://exemple.com/a/b");
  assert.equal(absoluteUrl("javascript:alert(1)", PAGE_URL), undefined);
  assert.equal(absoluteUrl("data:image/png;base64,AAAA", PAGE_URL), undefined);
  assert.equal(absoluteUrl("#ancre", PAGE_URL), undefined);
  assert.equal(absoluteUrl(undefined, PAGE_URL), undefined);
});

test("collectMarkdownImageUrls rend chaque image une fois", () => {
  const markdown = "![a](https://x.test/1.jpg)\n\ntexte\n\n![b](https://x.test/2.jpg)\n\n![c](https://x.test/1.jpg)";

  assert.deepEqual(collectMarkdownImageUrls(markdown), ["https://x.test/1.jpg", "https://x.test/2.jpg"]);
});

test("collectMarkdownImageUrls ignore les liens, qui ne sont pas des images", () => {
  assert.deepEqual(collectMarkdownImageUrls("[un lien](https://x.test/page)"), []);
});

test("rewriteMarkdownImageUrls remplace ce qui a été recopié et laisse le reste", () => {
  const markdown = "![a](https://x.test/1.jpg)\n\n![b](https://x.test/2.jpg)";
  const replacements = new Map([["https://x.test/1.jpg", "https://blob.test/1.jpg"]]);

  assert.equal(
    rewriteMarkdownImageUrls(markdown, replacements),
    "![a](https://blob.test/1.jpg)\n\n![b](https://x.test/2.jpg)"
  );
});
