import { ObjectId } from "mongodb";
import { Link } from "@/i18n/navigation.ts";
import { getGameCardAttributeFields } from "@/lib/db/cards.ts";
import {
  getAttributeGlossaryTerms,
  getCardGlossary,
  getKeywordGlossaryTerms,
} from "@/lib/db/card-translations.ts";
import { KEYWORD_GLOSSARY_FIELD } from "@/lib/cards/translations.ts";
import { getKeywordTranslations } from "@/lib/rules/riftbound.ts";
import { cn } from "@/lib/utils.ts";
import { AdminPage, AdminPanel } from "../../_components/AdminPage.tsx";
import { languageLabel, resolveTranslationContext, TranslationContextNav } from "../context.tsx";
import GlossaryEditor, { type GlossaryRow } from "./GlossaryEditor.tsx";

/**
 * Attributs qui ne se traduisent pas : des noms de personnes, ou une valeur
 * technique que l'application lit telle quelle.
 */
const UNTRANSLATED_FIELDS = new Set(["illustrator", "orientation"]);

export default async function AdminGlossaryPage({
  searchParams,
}: {
  searchParams: Promise<{ gameId?: string; lang?: string; field?: string }>;
}) {
  const params = await searchParams;
  const context = await resolveTranslationContext(params.gameId, params.lang);
  const { game, lang } = context;

  const description =
    "Un terme traduit une fois vaut pour toutes les cartes : les propriétés s'affichent traduites, et les mots-clés pré-remplissent le texte à traduire avec leur rappel.";

  if (!game) {
    return (
      <AdminPage title="Glossaire" description={description} back={{ href: "/admin/translations", label: "Traductions" }}>
        <TranslationContextNav context={context} basePath="/admin/translations/glossary" />
        <AdminPanel className="p-6 text-sm text-muted-foreground">Choisissez un jeu pour traduire son vocabulaire.</AdminPanel>
      </AdminPage>
    );
  }

  const gameId = new ObjectId(game.id);
  const [attributeFields, glossary] = await Promise.all([getGameCardAttributeFields(gameId), getCardGlossary(gameId, lang)]);

  const fields = [
    { key: KEYWORD_GLOSSARY_FIELD, label: "Mots-clés" },
    ...attributeFields
      .filter((field) => (field.type === "string" || field.type === "list") && !UNTRANSLATED_FIELDS.has(field.key))
      .map((field) => ({ key: field.key, label: field.key })),
  ];
  const field = fields.find((candidate) => candidate.key === params.field) ?? fields[0];
  const isKeyword = field.key === KEYWORD_GLOSSARY_FIELD;

  const terms = isKeyword ? await getKeywordGlossaryTerms(gameId) : await getAttributeGlossaryTerms(gameId, field.key);

  // Les règles de Riftbound existent en français : le nom officiel de chaque
  // mot-clé est proposé plutôt que ressaisi.
  const suggestions = new Map<string, string>(
    isKeyword && game.slug === "riftbound" && lang === "fr"
      ? getKeywordTranslations("fr").map((keyword) => [keyword.en, keyword.translated])
      : []
  );

  const saved = new Map(glossary.filter((entry) => entry.field === field.key).map((entry) => [entry.en, entry]));
  const rows: GlossaryRow[] = terms.map((term) => {
    const entry = saved.get(term.en);
    const suggestion = suggestions.get(term.en);
    return {
      en: term.en,
      count: term.count,
      value: entry?.value ?? suggestion ?? "",
      reminder: entry?.reminder ?? "",
      origin: entry ? "saved" : suggestion ? "rules" : "none",
    };
  });
  // Un terme enregistré qui n'apparaît plus sur aucune carte reste listé : le
  // retirer en silence perdrait une saisie.
  for (const entry of saved.values()) {
    if (!terms.some((term) => term.en === entry.en)) {
      rows.push({ en: entry.en, count: 0, value: entry.value, reminder: entry.reminder ?? "", origin: "saved" });
    }
  }

  const savedCount = (key: string) => glossary.filter((entry) => entry.field === key).length;

  return (
    <AdminPage
      title={`Glossaire ${game.name} · ${languageLabel(lang).toLowerCase()}`}
      description={description}
      width="wide"
      back={{ href: `/admin/translations?gameId=${game.id}&lang=${lang}`, label: "Traductions" }}
    >
      <TranslationContextNav context={context} basePath="/admin/translations/glossary" />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
        <nav aria-label="Catégories" className="flex flex-col gap-0.5 rounded-2xl border border-border bg-card p-1.5">
          {fields.map((candidate) => (
            <Link
              key={candidate.key}
              href={`/admin/translations/glossary?gameId=${game.id}&lang=${lang}&field=${candidate.key}`}
              aria-current={candidate.key === field.key ? "page" : undefined}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                candidate.key === field.key ? "bg-primary/10 text-foreground" : "hover:bg-muted"
              )}
            >
              <span>{candidate.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{savedCount(candidate.key)}</span>
            </Link>
          ))}
        </nav>

        <GlossaryEditor
          key={`${game.id}:${lang}:${field.key}`}
          gameId={game.id}
          lang={lang}
          field={field.key}
          title={field.label}
          isKeyword={isKeyword}
          rows={rows}
        />
      </div>
    </AdminPage>
  );
}
