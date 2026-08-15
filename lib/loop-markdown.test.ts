import test from "node:test";
import assert from "node:assert/strict";
import { bracketPlainCardMentions, createMarkdownCardMentionBracketer } from "@/lib/loop-markdown";

const CARDS = ["Flash", "Azir, Empereur", "Azir", "Lame dissimulée"];

test("bracketPlainCardMentions préfère le nom le plus long", () => {
  assert.equal(
    bracketPlainCardMentions("Le déclencheur d'Azir, Empereur se vérifie plus tard.", CARDS),
    "Le déclencheur d'[Azir, Empereur] se vérifie plus tard."
  );
});

test("bracketPlainCardMentions ne retouche pas ce qui est déjà entre crochets", () => {
  assert.equal(bracketPlainCardMentions("Jouer [Flash] en réaction.", CARDS), "Jouer [Flash] en réaction.");
});

test("createMarkdownCardMentionBracketer laisse les adresses d'images intactes", () => {
  const bracket = createMarkdownCardMentionBracketer(CARDS);

  // Sans protection, « Flash » croisé dans l'URL casserait la syntaxe de
  // l'image et l'actualité importée afficherait un lien mort.
  assert.equal(
    bracket("![](https://cdn.test/news/Flash-1848x1063.jpg)\n\nJouer Flash en réaction."),
    "![](https://cdn.test/news/Flash-1848x1063.jpg)\n\nJouer [Flash] en réaction."
  );
});

test("createMarkdownCardMentionBracketer laisse les liens intacts, texte compris", () => {
  const bracket = createMarkdownCardMentionBracketer(CARDS);

  assert.equal(
    bracket("Voir [la fiche de Flash](https://x.test/cards/flash) pour le détail."),
    "Voir [la fiche de Flash](https://x.test/cards/flash) pour le détail."
  );
});

test("createMarkdownCardMentionBracketer laisse le code tranquille", () => {
  const bracket = createMarkdownCardMentionBracketer(CARDS);

  assert.equal(bracket("Le champ `Flash` du document."), "Le champ `Flash` du document.");
  assert.equal(bracket("```\nFlash\n```"), "```\nFlash\n```");
});

test("createMarkdownCardMentionBracketer laisse les URL nues intactes", () => {
  const bracket = createMarkdownCardMentionBracketer(CARDS);

  assert.equal(
    bracket("Source : https://x.test/Flash/faq — jouer Flash en réaction."),
    "Source : https://x.test/Flash/faq — jouer [Flash] en réaction."
  );
});

test("createMarkdownCardMentionBracketer annote plusieurs paragraphes d'un coup", () => {
  const bracket = createMarkdownCardMentionBracketer(CARDS);

  assert.equal(
    bracket("Jouer Flash.\n\n- Lame dissimulée choisit une unité\n- Azir, Empereur attaque"),
    "Jouer [Flash].\n\n- [Lame dissimulée] choisit une unité\n- [Azir, Empereur] attaque"
  );
});

test("createMarkdownCardMentionBracketer sans catalogue rend le markdown tel quel", () => {
  assert.equal(createMarkdownCardMentionBracketer([])("Jouer Flash."), "Jouer Flash.");
});
