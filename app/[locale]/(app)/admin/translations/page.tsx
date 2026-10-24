import { ObjectId } from "mongodb";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  countTranslationStates,
  getCardGlossary,
  getCardToTranslate,
  getTranslationSets,
  listTranslationQueue,
  type TranslationQueueFilter,
} from "@/lib/db/card-translations.ts";
import {
  CARD_TRANSLATION_STATES,
  glossaryLookup,
  KEYWORD_GLOSSARY_FIELD,
  prefillTranslatedText,
  translateAttributeValue,
} from "@/lib/cards/translations.ts";
import { AdminPage, AdminPanel } from "../_components/AdminPage.tsx";
import { resolveTranslationContext, TranslationContextNav, languageLabel } from "./context.tsx";
import TranslationWorkbench, { type WorkbenchCard } from "./TranslationWorkbench.tsx";

function parseFilter(value: string | undefined): TranslationQueueFilter {
  return value === "all" || CARD_TRANSLATION_STATES.includes(value as never) ? (value as TranslationQueueFilter) : "todo";
}

export default async function AdminTranslationsPage({
  searchParams,
}: {
  searchParams: Promise<{ gameId?: string; lang?: string; state?: string; set?: string; q?: string; cardId?: string }>;
}) {
  const params = await searchParams;
  const context = await resolveTranslationContext(params.gameId, params.lang);
  const { game, lang } = context;
  const state = parseFilter(params.state);

  const description =
    "Traduisez le nom et le texte des cartes, l'une après l'autre. Types, domaines, étiquettes et mots-clés se traduisent une fois pour tout le jeu, dans le glossaire.";

  if (!game) {
    return (
      <AdminPage title="Traductions" description={description} width="wide">
        <TranslationContextNav context={context} basePath="/admin/translations" />
        <AdminPanel className="p-6 text-sm text-muted-foreground">Choisissez un jeu pour traduire ses cartes.</AdminPanel>
      </AdminPage>
    );
  }

  const gameId = new ObjectId(game.id);
  const [counts, sets, items, glossary] = await Promise.all([
    countTranslationStates(gameId, lang),
    getTranslationSets(gameId),
    listTranslationQueue(gameId, lang, { state, search: params.q, setCode: params.set || undefined }),
    getCardGlossary(gameId, lang),
  ]);

  const currentId = params.cardId ?? items[0]?.id;
  const card = currentId ? await getCardToTranslate(gameId, currentId, lang) : null;

  // Une traduction « à revoir » reste publiée : elle compte comme faite.
  const translated = counts.done + counts.stale;

  let workbenchCard: WorkbenchCard | undefined;
  if (card) {
    const lookup = glossaryLookup(glossary);
    const prefill = card.translation?.text ? undefined : prefillTranslatedText(card.text, glossary);
    const keywordValues = glossary
      .filter((entry) => entry.field === KEYWORD_GLOSSARY_FIELD && entry.value && card.text?.includes(`[${entry.en}`))
      .map((entry) => `[${entry.value}]`);
    const symbols = [...new Set(card.text?.match(/:[a-z0-9_]+:/g) ?? [])];

    workbenchCard = {
      id: card.id,
      name: card.name,
      text: card.text,
      image: card.image,
      orientation: card.orientation,
      code: [card.setCode, card.collectorNumber].filter(Boolean).join("-") || card.id,
      state: card.state,
      attributes: card.attributes.map((attribute) => {
        const translated = translateAttributeValue(lookup, attribute.key, attribute.value) as string | string[];
        const join = (value: string | string[]) => (Array.isArray(value) ? value.join(", ") : value);
        return {
          key: attribute.key,
          en: join(attribute.value),
          translated: join(translated),
          inGlossary: lookup.has(attribute.key) || join(translated) !== join(attribute.value),
        };
      }),
      translatedName: card.translation?.name ?? "",
      translatedText: card.translation?.text ?? prefill?.text ?? "",
      prefilledKeywords: prefill?.keywords ?? 0,
      staleSource: card.state === "stale" ? card.translation?.source : undefined,
      inserts: [...symbols, ...new Set(keywordValues)],
    };
  }

  const glossaryHref = `/admin/translations/glossary?gameId=${game.id}&lang=${lang}`;

  return (
    <AdminPage
      title="Traductions"
      description={description}
      width="wide"
      actions={
        <Button asChild variant="outline">
          <Link href={glossaryHref}>Glossaire {languageLabel(lang).toLowerCase()}</Link>
        </Button>
      }
    >
      <TranslationContextNav context={context} basePath="/admin/translations" />

      <AdminPanel className="flex flex-col gap-2 px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span>
            <span className="text-base font-semibold">{translated.toLocaleString("fr-FR")}</span> /{" "}
            {counts.all.toLocaleString("fr-FR")} cartes traduites en {languageLabel(lang).toLowerCase()}
          </span>
          <span className="text-muted-foreground">
            {glossary.length.toLocaleString("fr-FR")} terme{glossary.length === 1 ? "" : "s"} au glossaire
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-600"
            style={{ width: `${counts.all > 0 ? (translated / counts.all) * 100 : 0}%` }}
          />
        </div>
      </AdminPanel>

      <TranslationWorkbench
        // Changer de carte remonte le formulaire à neuf : une saisie ne doit
        // jamais passer d'une carte à l'autre.
        key={`${game.id}:${lang}:${workbenchCard?.id ?? "none"}`}
        gameId={game.id}
        gameSlug={game.slug ?? game.id}
        lang={lang}
        filter={state}
        setCode={params.set ?? ""}
        search={params.q ?? ""}
        sets={sets}
        counts={counts}
        items={items}
        card={workbenchCard}
        glossaryHref={glossaryHref}
      />
    </AdminPage>
  );
}
