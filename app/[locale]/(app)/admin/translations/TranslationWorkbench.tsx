"use client";

import { useRef, useState, useTransition, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import CardImage from "@/components/cards/CardImage.tsx";
import type { CardTranslationState } from "@/lib/cards/translations.ts";
import type { CardOrientation } from "@/lib/types/card.ts";
import type { TranslationCounts, TranslationQueueFilter, TranslationQueueItem } from "@/lib/db/card-translations.ts";
import { cn } from "@/lib/utils.ts";
import { saveTranslation } from "./actions.ts";

export type WorkbenchCard = {
  id: string;
  name: string;
  text?: string;
  image?: string;
  orientation?: CardOrientation;
  code: string;
  state: CardTranslationState;
  attributes: { key: string; en: string; translated: string; inGlossary: boolean }[];
  translatedName: string;
  /** La traduction enregistrée, ou à défaut le texte anglais aux mots-clés traduits. */
  translatedText: string;
  prefilledKeywords: number;
  /** Le nom et le texte anglais sur lesquels portait la traduction, quand ils ont changé depuis. */
  staleSource?: { name: string; text?: string };
  /** Symboles et mots-clés du texte, à insérer d'un clic. */
  inserts: string[];
};

const STATE_LABELS: Record<CardTranslationState, string> = {
  todo: "À traduire",
  stale: "À revoir",
  draft: "Brouillon",
  done: "Traduite",
};

const STATE_STYLES: Record<CardTranslationState, string> = {
  todo: "bg-muted text-muted-foreground",
  stale: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  draft: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
};

const FILTERS: { key: TranslationQueueFilter; label: string }[] = [
  { key: "todo", label: "À traduire" },
  { key: "stale", label: "À revoir" },
  { key: "draft", label: "Brouillons" },
  { key: "done", label: "Traduites" },
  { key: "all", label: "Tout" },
];

function StateBadge({ state }: { state: CardTranslationState }) {
  return (
    <span className={cn("shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", STATE_STYLES[state])}>
      {STATE_LABELS[state]}
    </span>
  );
}

export default function TranslationWorkbench({
  gameId,
  gameSlug,
  lang,
  filter,
  setCode,
  search,
  sets,
  counts,
  items,
  card,
  glossaryHref,
}: {
  gameId: string;
  gameSlug: string;
  lang: string;
  filter: TranslationQueueFilter;
  setCode: string;
  search: string;
  sets: string[];
  counts: TranslationCounts;
  items: TranslationQueueItem[];
  card?: WorkbenchCard;
  glossaryHref: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(card?.translatedName ?? "");
  const [text, setText] = useState(card?.translatedText ?? "");
  const [pending, startTransition] = useTransition();
  const textRef = useRef<HTMLTextAreaElement>(null);

  const href = (changes: { state?: TranslationQueueFilter; set?: string; q?: string; cardId?: string }) => {
    const params = new URLSearchParams({ gameId, lang });
    const state = changes.state ?? filter;
    const set = changes.set ?? setCode;
    const q = changes.q ?? search;
    if (state !== "todo") params.set("state", state);
    if (set) params.set("set", set);
    if (q) params.set("q", q);
    if (changes.cardId) params.set("cardId", changes.cardId);
    return `/admin/translations?${params.toString()}`;
  };

  // La carte suivante de la file. Une carte enregistrée quitte sa file
  // (« à traduire », « à revoir »…) : on prend celle d'après, et à défaut on
  // laisse le serveur rouvrir la file à son début.
  const currentIndex = card ? items.findIndex((item) => item.id === card.id) : -1;
  const nextItem = items.slice(currentIndex + 1).find((item) => item.id !== card?.id);
  const nextHref = href({ cardId: nextItem?.id });

  const save = (status: "draft" | "done") => {
    if (!card || pending) return;
    startTransition(async () => {
      const result = await saveTranslation(gameId, lang, card.id, { name, text, status });
      if (!result.success) {
        toast.error(result.error ?? "La traduction n'a pas pu être enregistrée.");
        return;
      }
      if (result.warning) toast.warning(result.warning);
      if (status === "done") {
        toast.success(`« ${name || card.name} » enregistrée.`);
        router.push(nextHref);
      } else {
        toast.success("Brouillon enregistré.");
        router.refresh();
      }
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      save("done");
    } else if (event.key === "ArrowRight" && event.altKey) {
      event.preventDefault();
      router.push(nextHref);
    }
  };

  const insert = (token: string) => {
    const area = textRef.current;
    const start = area?.selectionStart ?? text.length;
    const end = area?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + token + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      area?.focus();
      area?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)_minmax(0,1.3fr)]">
      <section aria-label="File des cartes" className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <nav aria-label="Statut" className="flex flex-wrap gap-1.5">
            {FILTERS.map((option) => (
              <Link
                key={option.key}
                href={href({ state: option.key, cardId: undefined })}
                aria-current={option.key === filter ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-medium",
                  option.key === filter
                    ? "border-foreground bg-foreground text-background"
                    : "border-border hover:border-foreground/40"
                )}
              >
                {option.label}
                <span className="opacity-70">{counts[option.key].toLocaleString("fr-FR")}</span>
              </Link>
            ))}
          </nav>
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const q = new FormData(event.currentTarget).get("q");
              router.push(href({ q: typeof q === "string" ? q.trim() : "", cardId: undefined }));
            }}
            className="flex flex-col gap-2"
          >
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Chercher une carte
              <Input name="q" defaultValue={search} placeholder="Nom ou identifiant" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Extension
              <select
                defaultValue={setCode}
                onChange={(event) => router.push(href({ set: event.target.value, cardId: undefined }))}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              >
                <option value="">Toutes</option>
                {sets.map((set) => (
                  <option key={set} value={set}>
                    {set}
                  </option>
                ))}
              </select>
            </label>
          </form>
        </div>
        <ul className="flex max-h-[32rem] flex-col gap-0.5 overflow-y-auto p-1.5 xl:max-h-[calc(100dvh-16rem)]">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={href({ cardId: item.id })}
                aria-current={item.id === card?.id ? "true" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm",
                  item.id === card?.id ? "border-primary bg-primary/5" : "border-transparent hover:bg-muted"
                )}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{item.translatedName || item.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
                </span>
                <StateBadge state={item.state} />
              </Link>
            </li>
          ))}
          {items.length === 0 && <li className="px-3 py-6 text-sm text-muted-foreground">Rien dans cette file.</li>}
        </ul>
        {items.length >= 60 && (
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Les 60 premières cartes, dans l&apos;ordre de collection. La suite vient à mesure qu&apos;elles sont traduites.
          </p>
        )}
      </section>

      {card ? (
        <>
          <section aria-label="Carte anglaise" className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Anglais · source</span>
              <Link href={`/games/${gameSlug}/cards/${card.id}`} className="font-mono text-xs text-muted-foreground hover:text-foreground">
                {card.code}
              </Link>
            </div>
            <div className="flex flex-wrap gap-4">
              {card.image && (
                <div className="w-40 shrink-0 overflow-hidden rounded-lg shadow-md">
                  <CardImage src={card.image} alt={card.name} orientation={card.orientation} className="w-full" />
                </div>
              )}
              <dl className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] content-start gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Nom</dt>
                <dd className="font-semibold">{card.name}</dd>
                {card.attributes.map((attribute) => (
                  <div key={attribute.key} className="contents">
                    <dt className="text-muted-foreground">{attribute.key}</dt>
                    <dd className="break-words">{attribute.en}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {card.text ? (
              <p className="whitespace-pre-line rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed">{card.text}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Cette carte n&apos;a pas de texte.</p>
            )}
          </section>

          <form
            aria-label="Traduction"
            onKeyDown={onKeyDown}
            onSubmit={(event) => {
              event.preventDefault();
              save("done");
            }}
            className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-card p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Traduction</span>
              <StateBadge state={card.state} />
            </div>

            {card.staleSource && (
              <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                <strong>L&apos;anglais a changé depuis la traduction</strong>
                {card.staleSource.name !== card.name && (
                  <p>
                    Nom : <del>{card.staleSource.name}</del> → {card.name}
                  </p>
                )}
                {(card.staleSource.text ?? "") !== (card.text ?? "") && (
                  <div className="flex flex-col gap-1">
                    <span>Le texte anglais au moment de la traduction :</span>
                    <p className="whitespace-pre-line rounded bg-background/60 p-2 text-xs">{card.staleSource.text || "(aucun)"}</p>
                  </div>
                )}
                <p>Corrigez ce qui a bougé puis enregistrez : la carte quitte la file « À revoir ».</p>
              </div>
            )}

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Nom
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={card.name} autoFocus className="text-base font-semibold" />
              <span className="text-xs font-normal text-muted-foreground">Vide : le nom anglais reste affiché.</span>
            </label>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="translation-text" className="text-sm font-medium">
                Texte
              </label>
              {card.inserts.length > 0 && (
                <div role="toolbar" aria-label="Insérer un symbole ou un mot-clé" className="flex flex-wrap gap-1.5">
                  {card.inserts.map((token) => (
                    <button
                      key={token}
                      type="button"
                      onClick={() => insert(token)}
                      className="h-7 rounded-md border border-border bg-muted/50 px-2 font-mono text-xs hover:bg-muted"
                    >
                      {token}
                    </button>
                  ))}
                </div>
              )}
              <Textarea
                id="translation-text"
                ref={textRef}
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={7}
                placeholder={card.text ? "Traduisez le texte de la carte…" : "Pas de texte"}
                className="min-h-40 font-mono text-sm leading-relaxed"
              />
              {card.prefilledKeywords > 0 && (
                <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  {card.prefilledKeywords} mot{card.prefilledKeywords > 1 ? "s" : ""}-clé{card.prefilledKeywords > 1 ? "s" : ""} traduit
                  {card.prefilledKeywords > 1 ? "s" : ""} depuis le glossaire. Les phrases restées en anglais sont à réécrire.
                </p>
              )}
            </div>

            {card.attributes.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">
                  Propriétés <span className="font-normal text-muted-foreground">· traduites par le</span>{" "}
                  <Link href={glossaryHref} className="font-normal underline underline-offset-2">
                    glossaire
                  </Link>
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {card.attributes.map((attribute) => (
                    <span
                      key={attribute.key}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs",
                        attribute.inGlossary ? "border-border" : "border-dashed border-border text-muted-foreground"
                      )}
                    >
                      <span className="text-muted-foreground">{attribute.key}</span>
                      <strong className="font-semibold">{attribute.translated}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                <kbd className="rounded border px-1 font-mono">Ctrl</kbd> + <kbd className="rounded border px-1 font-mono">Entrée</kbd> enregistrer et
                suivante · <kbd className="rounded border px-1 font-mono">Alt</kbd> + <kbd className="rounded border px-1 font-mono">→</kbd> passer
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href={nextHref}>Passer</Link>
                </Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => save("draft")}>
                  Brouillon
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Enregistrement…" : "Enregistrer et suivante"}
                </Button>
              </div>
            </div>
          </form>
        </>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground xl:col-span-2">
          {items.length === 0 ? "Aucune carte dans cette file. Changez de filtre pour en voir d'autres." : "Choisissez une carte dans la file."}
        </div>
      )}
    </div>
  );
}
