'use client';

import {type ReactNode, useState} from "react";
import {DateTime} from "luxon";
import ReactMarkdown from "react-markdown";
import {useLocale, useTranslations} from "next-intl";
import CardImage from "@/components/cards/CardImage.tsx";
import type {DeckListCard} from "@/app/[locale]/(app)/games/riftbound/deck-checker/action.ts";
import type {Errata, ErrataType} from "@/lib/types/errata.ts";

/*
  Affichage d'un deck vérifié, partagé entre la page du vérificateur de deck et
  sa vue MCP App (mcp-apps/deck-check), rendue dans le client de l'utilisateur.
  Rien ici ne touche au serveur ni au routeur : le fichier est empaqueté tel
  quel hors de Next.js, `next-intl` y étant remplacé par `use-intl`.
*/

/** Ce que l'affichage lit d'un errata : un deck passé en JSON n'emporte que ça. */
export type DeckViewErrata = Pick<Errata, "id" | "type" | "details" | "source"> & {
  errataDate: Date | string;
  deprecatedAt?: Date | string | null;
};

export type DeckViewCard = Omit<DeckListCard, "erratas"> & { erratas?: DeckViewErrata[] };

export type DeckViewList = Record<"champions" | "legends" | "maindeck" | "sideboard" | "battlefields" | "runes", DeckViewCard[]>;

export const ConstructionRules = {
  legends: {
    min: 1,
    max: 1,
  },
  champions: {
    min: 1,
    max: 1,
  },
  maindeck: {
    min: 39,
    max: 39,
  },
  sideboard: {
    min: 0,
    max: 10,
  },
  runes: {
    min: 12,
    max: 12,
  },
};

export type SectionRules = { min: number; max: number };

// ── Errata type badge ─────────────────────────────────────────────────────────
export const ERRATA_CLASS: Record<ErrataType, string> = {
  errata: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  clarification: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ruling: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

export function hasCardDetails(card: DeckViewCard): boolean {
  return !!card.recognized || (card.erratas?.length ?? 0) > 0;
}

// ── Card tile ─────────────────────────────────────────────────────────────────
/**
 * La vignette d'une carte : illustration, quantité, nom, et pastille « bannie »
 * ou « notes ». `controls` se pose à côté de la quantité (les boutons −/+ de la
 * page), `selected` entoure la vignette dont le détail est ouvert.
 */
export function DeckCardTile({card, controls, selected, ...props}: {
  card: DeckViewCard;
  controls?: { before?: ReactNode; after?: ReactNode };
  selected?: boolean;
} & React.HTMLAttributes<HTMLDivElement>) {
  const hasErratas = (card.erratas?.length ?? 0) > 0;
  const t = useTranslations('Games.DeckChecker');
  const [imageFailed, setImageFailed] = useState(false);

  const statusPill = card.banned ? (
    <div className="mt-1 flex justify-center">
      <span className="bg-red-600 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none uppercase tracking-widest">
        {t('cards.banned')}
      </span>
    </div>
  ) : hasErratas ? (
    <div className="mt-1 flex justify-center">
      <span className="cursor-pointer bg-yellow-600 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none uppercase tracking-widest">
        {t('cards.notes')}
      </span>
    </div>
  ) : null;

  return (
    <div className="flex flex-col" {...props}>
      <div
        className={`relative rounded-lg overflow-hidden shadow-md bg-gray-800 group cursor-pointer${hasErratas ? ' ring-2 ring-yellow-600' : ''}${card.banned ? ' ring-2 ring-red-500' : ''}${selected ? ' outline-2 outline-offset-2 outline-foreground' : ''}`}
        style={{aspectRatio: '2.5 / 3.5'}}
      >
        {card.image && !imageFailed ? (
          <CardImage
            src={card.image}
            alt={card.name}
            orientation={card.orientation}
            frame="2.5/3.5"
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-700 p-2 gap-1">
            <span className="text-3xl opacity-40">?</span>
            <span className={`${card.recognized ? 'text-white' : 'text-red-400'} text-center text-xs font-medium leading-tight line-clamp-3`}>{card.name}</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5">
          {controls?.before}
          <div className="bg-black/75 text-white text-xs font-bold rounded px-1.5 py-0.5 leading-none">
            &times;{card.quantity}
          </div>
          {controls?.after}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pt-4 pb-1.5 px-1.5">
          <p className={`text-xs font-medium truncate ${!card.recognized ? 'text-red-400' : 'text-white'}`}>
            {card.name}
          </p>
        </div>
      </div>
      {statusPill}
    </div>
  );
}

// ── Card details ──────────────────────────────────────────────────────────────
/** Le détail d'une carte : illustration, bannissement, erratas et rulings. */
export function DeckCardDetails({card, imageClassName = "w-40"}: { card: DeckViewCard; imageClassName?: string }) {
  const hasErratas = (card.erratas?.length ?? 0) > 0;
  const t = useTranslations('Games.DeckChecker');
  const locale = useLocale();
  const [imageFailed, setImageFailed] = useState(false);
  const formatDate = (value: string | Date) => {
    const parsedDate = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(value);
    return parsedDate.isValid ? parsedDate.setLocale(locale).toLocaleString(DateTime.DATE_MED) : value.toString();
  };

  return (
    <div className="flex gap-6 mt-1">
      {/* Card image */}
      {card.image && !imageFailed && (
        <CardImage
          src={card.image}
          alt={card.name}
          orientation={card.orientation}
          onError={() => setImageFailed(true)}
          className={`${imageClassName} shrink-0 rounded-lg shadow-md self-start`}
        />
      )}

      {/* Details */}
      <div className="flex-1 min-w-0">
        {card.banned && (
          <p className="mb-4 text-sm text-red-500 font-medium">
            {t('cards.bannedMessage')}
          </p>
        )}

        {hasErratas ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {t('cards.errataSectionTitle', { count: card.erratas!.length })}
            </h3>
            {card.erratas!.map((errata, i) => (
              <div key={errata.id ?? i} className={`rounded-lg border p-3 ${errata.deprecatedAt ? 'opacity-50' : ''}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${ERRATA_CLASS[errata.type]}`}>
                    {t(`errataTypes.${errata.type}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(errata.errataDate)}
                  </span>

                  {errata.deprecatedAt && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                      {t('cards.deprecated')}
                    </span>
                  )}
                </div>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{errata.details}</ReactMarkdown>
                </div>
                {errata.source && (
                  <div className="mt-2 pt-2 border-t">
                    <a href={errata.source} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                      {t('cards.source')}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('cards.noErrata')}</p>
        )}
      </div>
    </div>
  );
}

// ── Section grid ──────────────────────────────────────────────────────────────
/**
 * Une section du deck : titre, compte, règle de construction et grille de
 * cartes. `renderCard` dessine chaque carte — avec sa fenêtre de détail sur la
 * page, avec une sélection dans la vue MCP — et `footer` se pose sous la grille.
 */
export function DeckSection({title, cards, compact, rules, renderCard, footer}: {
  title: string;
  cards: DeckViewCard[];
  compact?: boolean;
  rules?: SectionRules;
  renderCard: (card: DeckViewCard, index: number) => ReactNode;
  footer?: ReactNode;
}) {
  const t = useTranslations('Games.DeckChecker');
  const total = cards.reduce((sum, c) => sum + c.quantity, 0);
  const ruleNote = rules ? (rules.min === rules.max
    ? t('sections.rules.requiredCount', { count: rules.min })
    : t('sections.rules.requiredRange', { min: rules.min, max: rules.max })) : null;

  // Hide section only when empty AND (no rules OR min is 0)
  if (cards.length === 0 && (!rules || rules.min === 0)) return null;

  const isInvalid = rules ? (total < rules.min || total > rules.max) : false;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className={`text-sm font-medium ${isInvalid ? 'text-red-500' : 'text-muted-foreground'}`}>
          ({t('sections.count', { count: total })})
        </span>
        {isInvalid && (
          <span className="text-[10px] font-bold bg-red-600 text-white rounded-full px-2 py-0.5 uppercase tracking-widest leading-none">
            {t('sections.invalid')}
          </span>
        )}
        {rules && (
          <span className="text-xs text-muted-foreground italic">
            {ruleNote}
          </span>
        )}
      </div>
      {cards.length > 0 && (
        <div className={compact
          ? "grid grid-cols-2 gap-2"
          : "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2"}>
          {cards.map((card, idx) => renderCard(card, idx))}
        </div>
      )}
      {footer}
    </div>
  );
}

/** Les cartes non reconnues, listées sous le deck. */
export function UnrecognizedCards({cards}: { cards: DeckViewCard[] }) {
  const t = useTranslations('Games.DeckChecker');
  if (cards.length === 0) return null;
  return (
    <div className="border border-red-500/40 rounded-lg p-4 bg-red-950/20">
      <h3 className="text-sm font-semibold text-red-400 mb-2">⚠ {t('cards.unrecognizedTitle')}</h3>
      <ul className="list-disc list-inside space-y-0.5">
        {cards.map((c, i) => <li key={i} className="text-red-400 text-sm">{c.name}</li>)}
      </ul>
    </div>
  );
}
