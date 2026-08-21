"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Ban, Images, List } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import CardImage from "@/components/cards/CardImage.tsx";
import type {
  TournamentForm,
  TournamentFormAnswer,
  TournamentFormCard,
  TournamentFormDecklistAnswer,
} from "@/lib/types/Tournament.ts";

/**
 * Affichage en lecture des réponses au formulaire, partagé par la fiche joueur
 * (organisation) et le portail joueur. Les champs adossés au jeu ne se lisent
 * pas comme du texte : une carte se montre, une liste de deck se parcourt.
 */
export function FormAnswersView({
  form,
  answers,
}: {
  form: TournamentForm;
  answers: TournamentFormAnswer[];
}) {
  const t = useTranslations("Tournaments");
  const byField = new Map(answers.map((answer) => [answer.fieldId, answer]));

  return (
    <dl className="flex flex-col gap-3.5">
      {form.fields.map((field) => {
        const answer = byField.get(field.id);
        return (
          <div key={field.id}>
            <dt className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {field.label}
              {answer?.late && <LateBadge />}
            </dt>
            <dd className="mt-1 text-sm">
              {!answer ? (
                <span
                  className={cn(
                    "text-muted-foreground",
                    // Une question obligatoire restée sans réponse est un
                    // manque à traiter, pas un simple blanc.
                    field.required && "font-semibold text-destructive"
                  )}
                >
                  {t("form.noAnswer")}
                </span>
              ) : answer.card ? (
                <CardAnswer card={answer.card} />
              ) : answer.decklist ? (
                <DecklistAnswer decklist={answer.decklist} />
              ) : answer.choices ? (
                <div className="flex flex-wrap gap-1.5">
                  {answer.choices.map((choice) => (
                    <span key={choice} className="rounded-md border bg-muted px-2 py-0.5 text-[13px]">
                      {choice}
                    </span>
                  ))}
                </div>
              ) : answer.number !== undefined ? (
                <span className="font-mono tabular-nums">{answer.number}</span>
              ) : (
                <span className="whitespace-pre-wrap">{answer.text}</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * Réponse enregistrée après la fermeture de la saisie, au titre des réponses
 * tardives. Rouge et à côté de la réponse : l'arbitrage doit voir d'un coup
 * d'œil ce qui est arrivé hors délai.
 */
export function LateBadge() {
  const t = useTranslations("Tournaments");
  return (
    <span
      title={t("form.lateBadgeTitle")}
      className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-[0.06em] text-white"
    >
      {t("form.lateBadge")}
    </span>
  );
}

/** Carte choisie : le visuel identifie plus vite que le nom. */
export function CardAnswer({ card }: { card: TournamentFormCard }) {
  return (
    <div className="flex items-center gap-2.5">
      {card.image && (
        // eslint-disable-next-line @next/next/no-img-element -- visuels servis par les CDN des jeux
        <img src={card.image} alt={card.name} className="h-20 w-auto rounded-md border" />
      )}
      <div className="min-w-0">
        <p className="truncate font-medium">{card.name}</p>
        {(card.setCode || card.collectorNumber) && (
          <p className="font-mono text-xs text-muted-foreground">
            {card.setCode} {card.collectorNumber && `#${card.collectorNumber}`}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Liste de deck : vue liste pour vérifier des quantités, vue visuelle pour
 * reconnaître un deck d'un coup d'œil. Quand l'analyse a échoué (ou que le jeu
 * ne la supporte pas), la saisie brute reste affichée telle quelle.
 */
export function DecklistAnswer({ decklist }: { decklist: TournamentFormDecklistAnswer }) {
  const t = useTranslations("Tournaments");
  const [visual, setVisual] = useState(false);
  const parsed = decklist.parsed;

  if (!parsed) {
    return (
      <div>
        {decklist.parseError && (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5 shrink-0" />
            {t("form.decklistParseError")}
          </p>
        )}
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-2.5 font-mono text-[12px]">
          {decklist.input}
        </pre>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setVisual(false)}
            aria-pressed={!visual}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
              visual ? "text-muted-foreground hover:text-foreground" : "bg-accent text-foreground"
            )}
          >
            <List className="size-3.5" />
            {t("form.decklistViewList")}
          </button>
          <button
            type="button"
            onClick={() => setVisual(true)}
            aria-pressed={visual}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors",
              visual ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Images className="size-3.5" />
            {t("form.decklistViewVisual")}
          </button>
        </div>
        <span className="text-xs text-muted-foreground">
          {t("form.decklistCount", { count: parsed.totalCards })}
        </span>
        {parsed.unrecognizedCards > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="size-3.5" />
            {t("form.decklistUnrecognized", { count: parsed.unrecognizedCards })}
          </span>
        )}
        {parsed.bannedCards > 0 && (
          <span className="flex items-center gap-1 text-xs text-destructive">
            <Ban className="size-3.5" />
            {t("form.decklistBanned", { count: parsed.bannedCards })}
          </span>
        )}
      </div>

      <div className={cn("flex flex-col gap-3", !visual && "sm:grid sm:grid-cols-2 sm:gap-x-6")}>
        {parsed.sections.map((section) => (
          <div key={section.key} className="min-w-0">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {/* Un jeu peut nommer une section que la traduction ne connaît
                  pas encore : la clé brute reste plus utile qu'un vide. */}
              {t.has(`form.decklistSections.${section.key}`)
                ? t(`form.decklistSections.${section.key}`)
                : section.key}
            </p>
            {visual ? (
              <div className="flex flex-wrap gap-1.5">
                {section.cards.map((card, index) => (
                  <div key={`${card.cardId ?? card.name}-${index}`} className="relative">
                    {card.image ? (
                      <CardImage
                        src={card.image}
                        alt={card.name}
                        orientation={card.orientation}
                        title={card.name}
                        loading="lazy"
                        className={cn(
                          "h-28 w-auto rounded-md border",
                          card.banned && "ring-2 ring-destructive"
                        )}
                      />
                    ) : (
                      <span className="flex h-28 w-20 items-center justify-center rounded-md border border-dashed p-1 text-center text-[10px] leading-tight text-muted-foreground">
                        {card.name}
                      </span>
                    )}
                    <span className="absolute bottom-0.5 right-0.5 rounded bg-neutral-950/85 px-1 font-mono text-[10px] font-bold text-white">
                      ×{card.quantity}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="flex flex-col">
                {section.cards.map((card, index) => (
                  <li
                    key={`${card.cardId ?? card.name}-${index}`}
                    className="flex items-baseline gap-2 text-[13px]"
                  >
                    <span className="w-6 shrink-0 text-right font-mono text-muted-foreground">
                      {card.quantity}
                    </span>
                    <span
                      className={cn(
                        "min-w-0 truncate",
                        card.banned && "text-destructive line-through",
                        !card.banned && card.recognized === false && "text-amber-600 dark:text-amber-400"
                      )}
                      title={card.name}
                    >
                      {card.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
