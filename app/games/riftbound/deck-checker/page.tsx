'use client';

import {useEffect, useState} from "react";
import {DateTime} from "luxon";
import ReactMarkdown from "react-markdown";
import {Button} from "@/components/ui/button";
import {Label} from "@/components/ui/label";
import {Textarea} from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  validateDeckList, type DeckListCard, type DeckList, analyzeDeckListImageBase64Action,
  analyzeDeckListImageURLAction, getDeckFromPiltover
} from "./action";
import {type ErrataType} from "@/lib/types/errata";
import {type BoosterCard} from "@/lib/types/booster";
import {useSession} from "@/lib/auth-client";
import {parseDeckList, serializeDeckList, stringifyDeckList} from "@/app/games/riftbound/deck-checker/utils";
import {upload} from "@vercel/blob/client";
import {Pencil} from "lucide-react";
import {useLocale, useTranslations} from "next-intl";

const ConstructionRules = {
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
    max: 8,
  },
  runes: {
    min: 12,
    max: 12,
  },
}


// ── Errata type badge ─────────────────────────────────────────────────────────
const ERRATA_CLASS: Record<ErrataType, string> = {
  errata: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  clarification: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  ruling: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
};

// ── Edit card dialog ──────────────────────────────────────────────────────────
function EditCardDialog({
                          card,
                          onSelect,
                          onClose,
                        }: {
  card: DeckListCard | null;
  onSelect: (newCardName: string) => void;
  onClose: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState(card?.name ?? "");
  const [results, setResults] = useState<BoosterCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const t = useTranslations('DeckChecker');

  // Reset search query when the edited card changes
  useEffect(() => {
    if (card) setSearchQuery(card.name);
  }, [card]);

  useEffect(() => {
    if (!card) return;
    if (searchQuery.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/games/riftbound/cards?searchQuery=${encodeURIComponent(searchQuery)}&setCode=*&lang=en`
        );
        const data: BoosterCard[] = await res.json();
        setResults(data.slice(0, 20));
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, card]);

  return (
    <Dialog open={!!card} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>{t('cards.editTitle')}</DialogTitle>
          {card && (
            <p className="text-sm text-muted-foreground">
              {t('cards.replace', { cardName: card.name })}
            </p>
          )}
        </DialogHeader>
        <Command shouldFilter={false} className="border-t rounded-none">
          <CommandInput
            placeholder={t('cards.searchPlaceholder')}
            value={searchQuery}
            onValueChange={setSearchQuery}
            autoFocus
          />
          <CommandList className="max-h-80">
            {isSearching ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('cards.searching')}</div>
            ) : searchQuery.length < 2 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{t('cards.minChars')}</div>
            ) : results.length === 0 ? (
              <CommandEmpty>{t('cards.noResults')}</CommandEmpty>
            ) : (
              <CommandGroup>
                {results.map((result) => (
                  <CommandItem
                    key={`${result.id}-${result.setCode}-${result.collectorNumber}`}
                    value={result.id}
                    onSelect={() => onSelect(result.name)}
                    className="cursor-pointer gap-3 py-2"
                  >
                    {result.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={result.image} alt={result.name} className="w-10 h-auto rounded shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{result.name}</div>
                      {result.subtitle && (
                        <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {result.setCode} #{result.collectorNumber}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

// ── Card tile ─────────────────────────────────────────────────────────────────
function CardTile({card, onEdit, onQuantityChange}: {card: DeckListCard; onEdit?: () => void; onQuantityChange?: (delta: number) => void}) {
  const hasErratas = (card.erratas?.length ?? 0) > 0;
  const t = useTranslations('DeckChecker');
  const locale = useLocale();
  const formatDate = (value: string | Date) => {
    const parsedDate = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(value);
    return parsedDate.isValid ? parsedDate.setLocale(locale).toLocaleString(DateTime.DATE_MED) : value.toString();
  };

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

  const cardContent = (
    <div className="flex flex-col">
      <div
        className={`relative rounded-lg overflow-hidden shadow-md bg-gray-800 group cursor-pointer${hasErratas ? ' ring-2 ring-yellow-600' : ''}${card.banned ? ' ring-2 ring-red-500' : ''}`}
        style={{aspectRatio: '2.5 / 3.5'}}
      >
        {card.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.image} alt={card.name} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gray-700 p-2 gap-1">
            <span className="text-3xl opacity-40">?</span>
            <span className="text-red-400 text-center text-xs font-medium leading-tight line-clamp-3">{card.name}</span>
          </div>
        )}
        <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5">
          {onQuantityChange && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuantityChange(-1); }}
              disabled={card.quantity <= 1}
              className="w-5 h-5 flex items-center justify-center bg-black/75 hover:bg-black text-white text-sm font-bold rounded leading-none opacity-0 group-hover/card:opacity-100 transition-opacity disabled:opacity-20 disabled:cursor-not-allowed"
            >−</button>
          )}
          <div className="bg-black/75 text-white text-xs font-bold rounded px-1.5 py-0.5 leading-none">
            &times;{card.quantity}
          </div>
          {onQuantityChange && (
            <button
              onClick={(e) => { e.stopPropagation(); onQuantityChange(+1); }}
              className="w-5 h-5 flex items-center justify-center bg-black/75 hover:bg-black text-white text-sm font-bold rounded leading-none opacity-0 group-hover/card:opacity-100 transition-opacity"
            >+</button>
          )}
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

  const cardWithDialog = (!card.recognized && !hasErratas) ? cardContent : (
    <Dialog>
      <DialogTrigger asChild>{cardContent}</DialogTrigger>
      <DialogContent className="min-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {card.name}
            {card.banned && (
              <span className="text-[11px] font-bold bg-red-600 text-white rounded px-2 py-0.5 uppercase tracking-widest">
                {t('cards.banned')}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 mt-1">
          {/* Card image */}
          {card.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={card.image}
              alt={card.name}
              className="w-40 shrink-0 rounded-lg shadow-md self-start"
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
      </DialogContent>
    </Dialog>
  );

  if (!onEdit && !onQuantityChange) return cardWithDialog;

  return (
    <div className={`group/card relative${onEdit ? ' pb-7' : ''}`}>
      {cardWithDialog}
      {onEdit && (
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          className="absolute bottom-0 left-0 right-0 h-7 flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground opacity-0 group-hover/card:opacity-100 transition-opacity"
          title={t('cards.editTitle')}
        >
          <Pencil size={11} />
          <span>{t('cards.edit')}</span>
        </button>
      )}
    </div>
  );
}

// ── Section grid ──────────────────────────────────────────────────────────────
type SectionRules = { min: number; max: number };


function DeckSection({title, cards, compact, rules, onEditCard, onQuantityChange}: {title: string; cards: DeckListCard[]; compact?: boolean; rules?: SectionRules; onEditCard?: (index: number) => void; onQuantityChange?: (index: number, delta: number) => void}) {
  const t = useTranslations('DeckChecker');
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
          {cards.map((card, idx) => (
            <CardTile
              key={`${card.name}-${idx}`}
              card={card}
              onEdit={onEditCard ? () => onEditCard(idx) : undefined}
              onQuantityChange={onQuantityChange ? (delta) => onQuantityChange(idx, delta) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function RiftboundDeckCheckerPage() {
  const t = useTranslations('DeckChecker');

  const session = useSession();
  const [rawDeckList, setRawDeckList] = useState("");
  const [deckList, setDeckList] = useState<DeckList | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canUseImageLoader] = useState<boolean>(false);
  const [editingCard, setEditingCard] = useState<{ section: keyof DeckList; index: number } | null>(null);

  async function importDeckList() {
    setIsLoading(true);
    setError(null);
    try {
      let parsed: DeckList;

      if (rawDeckList.startsWith('https://piltoverarchive.com/decks/view/')) {
        const deckId = rawDeckList.split('/').at(-1)!;
        parsed = await getDeckFromPiltover(deckId);
      } else {
        parsed = parseDeckList(rawDeckList);
      }

      setDeckList(await validateDeckList(parsed));
    } catch (err) {
      console.error("Erreur lors de l'import de la liste de deck", err);
      setError(err instanceof Error ? err.message : t('form.errors.generic'));
      setDeckList(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setIsLoading(true);
      // if file <1 MB
      if (file.size <= 1024 * 1024) {

        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const base64 = reader.result as string;
            const verifyResult = await analyzeDeckListImageBase64Action(base64);
            setRawDeckList(verifyResult.raw);
            setDeckList(await validateDeckList(verifyResult.deckList))

            setIsLoading(false);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : t('form.errors.imageCheck')
            );
          } finally {
            setIsLoading(false);
          }
        };
        reader.onerror = () => {
          setError(t('form.errors.imageRead'));
          setIsLoading(false);
        };
        reader.readAsDataURL(file);
      } else {
        // upload file to vercel storage using pre-signed URL first.
        try {
          const newBlob = await upload(`/deck-images/${file.name}`, file, {
            access: 'public',
            handleUploadUrl: '/api/deck-images/upload',
          });

          const verifyResult = await analyzeDeckListImageURLAction(newBlob.url);
          setRawDeckList(verifyResult.raw);
          setDeckList(await validateDeckList(verifyResult.deckList))

          setIsLoading(false);
        } catch (err) {
          setError(
            err instanceof Error ? err.message : t('form.errors.imageCheck')
          );
        } finally {
          setIsLoading(false);
        }
      }
    }
  }

  useEffect(() => {
    if (!session?.data) {
      return;
    }
  }, [session]);

  function handleQuantityChange(section: keyof DeckList, index: number, delta: number) {
    if (!deckList) return;
    const card = deckList[section][index];
    const newQuantity = card.quantity + delta;
    if (newQuantity < 1) return;
    const newDeckList: DeckList = {
      ...deckList,
      [section]: deckList[section].map((c, i) =>
        i === index ? { ...c, quantity: newQuantity } : c
      ),
    };
    setDeckList(newDeckList);
    setRawDeckList(stringifyDeckList(newDeckList));
  }

  async function handleEditCard(newCardName: string) {
    if (!deckList || !editingCard) return;
    const { section, index } = editingCard;
    const oldCard = deckList[section][index];
    const newDeckList: DeckList = {
      ...deckList,
      [section]: deckList[section].map((card, i) =>
        i === index ? { name: newCardName, quantity: oldCard.quantity } : card
      ),
    };
    setEditingCard(null);
    setRawDeckList(stringifyDeckList(newDeckList));
    setIsLoading(true);
    try {
      setDeckList(await validateDeckList(newDeckList));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('form.errors.generic'));
    } finally {
      setIsLoading(false);
    }
  }

  const allCards = deckList ? [...deckList.legends, ...deckList.champions, ...deckList.maindeck, ...deckList.battlefields, ...deckList.runes, ...deckList.sideboard] : [];
  const unrecognized = allCards.filter(c => !c.recognized);

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <h1 className="text-3xl font-bold mb-6">{t('title')}</h1>

      <div className="mb-8">
        <div className="mb-3">
          <Label htmlFor="deck-list" className="block text-sm font-medium mb-2">
            {t('form.label')}
          </Label>
          <Textarea
            id="deck-list"
            value={rawDeckList}
            onChange={(e) => setRawDeckList(e.target.value)}
            placeholder={t('form.placeholder')}
            className="w-full h-60 p-3 border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {canUseImageLoader &&
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
              id="deck-image"
            />
          }
        </div>

        <div className="flex flex-row space-x-4">
          <Button onClick={importDeckList} disabled={isLoading || !rawDeckList.trim()}>
            {isLoading ? t('form.loading') : t('form.validate')}
          </Button>
          {canUseImageLoader && (
            <Button asChild variant="outline">
              <label htmlFor="deck-image" className="cursor-pointer">
                {isLoading ? t('form.loading') : t('form.uploadPhoto')}
              </label>
            </Button>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      </div>

      {deckList && (
        <div className="space-y-8">
          <Button className="hidden" onClick={() => {
            const link = `${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000'}/riftbound/deck-checker?deckCode=${serializeDeckList(deckList)}`;

            if (window?.navigator?.clipboard) {
              window?.navigator?.clipboard.writeText(link);
            }
          }}>{t('form.copyLink')}</Button>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <DeckSection title={t('sections.legend')} cards={deckList.legends} compact rules={ConstructionRules.legends} onEditCard={(i) => setEditingCard({ section: 'legends', index: i })} onQuantityChange={(i, d) => handleQuantityChange('legends', i, d)} />
            <DeckSection title={t('sections.champion')} cards={deckList.champions} compact rules={ConstructionRules.champions} onEditCard={(i) => setEditingCard({ section: 'champions', index: i })} onQuantityChange={(i, d) => handleQuantityChange('champions', i, d)} />
            <DeckSection title={t('sections.battlefields')} cards={deckList.battlefields} compact onEditCard={(i) => setEditingCard({ section: 'battlefields', index: i })} onQuantityChange={(i, d) => handleQuantityChange('battlefields', i, d)} />
            <DeckSection title={t('sections.runes')} cards={deckList.runes} compact rules={ConstructionRules.runes} onEditCard={(i) => setEditingCard({ section: 'runes', index: i })} onQuantityChange={(i, d) => handleQuantityChange('runes', i, d)} />
          </div>
          <DeckSection title={t('sections.mainDeck')} cards={deckList.maindeck} rules={ConstructionRules.maindeck} onEditCard={(i) => setEditingCard({ section: 'maindeck', index: i })} onQuantityChange={(i, d) => handleQuantityChange('maindeck', i, d)} />
          <DeckSection title={t('sections.sideboard')} cards={deckList.sideboard} rules={ConstructionRules.sideboard} onEditCard={(i) => setEditingCard({ section: 'sideboard', index: i })} onQuantityChange={(i, d) => handleQuantityChange('sideboard', i, d)} />

          {unrecognized.length > 0 && (
            <div className="border border-red-500/40 rounded-lg p-4 bg-red-950/20">
              <h3 className="text-sm font-semibold text-red-400 mb-2">⚠ {t('cards.unrecognizedTitle')}</h3>
              <ul className="list-disc list-inside space-y-0.5">
                {unrecognized.map((c, i) => <li key={i} className="text-red-400 text-sm">{c.name}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <EditCardDialog
        key={editingCard ? `${editingCard.section}-${editingCard.index}` : 'closed'}
        card={editingCard ? deckList?.[editingCard.section][editingCard.index] ?? null : null}
        onSelect={handleEditCard}
        onClose={() => setEditingCard(null)}
      />
    </div>
  );
}