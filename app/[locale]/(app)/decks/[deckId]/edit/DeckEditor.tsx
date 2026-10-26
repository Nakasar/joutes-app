"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DateTime } from "luxon";
import { LayoutGrid, List, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { SegmentedControl } from "@/components/decks/SegmentedControl.tsx";
import { ShareDeckDialog } from "@/components/decks/ShareDeckDialog.tsx";
import { DeckCoverButton, DeckCoverDialog } from "@/components/decks/DeckCoverDialog.tsx";
import { DeckVisibilityBadge } from "@/components/decks/DeckBadges.tsx";
import { cn } from "@/lib/utils.ts";
import {
  changeCardQuantity,
  deckSize,
  moveCard,
  zoneCount,
  type DeckCardInfo,
  type DeckCards,
} from "@/lib/decks/contents.ts";
import { resolveDeckCover } from "@/lib/decks/cover.ts";
import { stringifyDeckText } from "@/lib/decks/text.ts";
import { AUTO_ZONE, routeCardToZone, zoneHoldingCard, type DeckTargetZone } from "@/lib/decks/routing.ts";
import type { DeckZone, DeckZoneKey } from "@/lib/decks/zones.ts";
import { DECK_VISIBILITIES, DECK_VISIBILITY_LABELS, type Deck, type DeckVisibility } from "@/lib/types/Deck.ts";
import { DeckCatalog } from "./DeckCatalog.tsx";
import { DeckPanels } from "./DeckPanels.tsx";
import { DeckTextTab } from "./DeckTextTab.tsx";
import { DeckZonesEditor, type DeckDrag } from "./DeckZonesEditor.tsx";
import DeleteDeckButton from "../DeleteDeckButton.tsx";

/** Noms par requête d'exemplaires possédés : le plafond de la route `ownership`. */
const OWNERSHIP_BATCH = 120;

/**
 * Éditeur de deck : le catalogue à gauche, les zones au centre, l'analyse à
 * droite.
 *
 * Tout se passe sur une seule page. Le contenu vit en mémoire pendant qu'on le
 * manipule et ne part en base qu'à l'enregistrement : recompter les zones, la
 * courbe et la légalité est instantané là où un aller-retour par carte ajoutée
 * rendrait la construction pénible.
 *
 * Sous `xl`, les colonnes latérales passent sous la colonne centrale plutôt que
 * de se serrer jusqu'à l'illisible.
 */
export function DeckEditor({
  deck,
  gameName,
  gameSlug,
  zones,
  initialCatalog,
  ownedByCardId: initialOwnedByCardId,
  copyLimit,
  exportCode,
}: {
  deck: Deck;
  gameName?: string;
  gameSlug: string;
  zones: DeckZone[];
  initialCatalog: DeckCardInfo[];
  /** Exemplaires possédés par identifiant de carte ; absent = collection inconnue. */
  ownedByCardId?: Record<string, number>;
  copyLimit?: number;
  exportCode?: string;
}) {
  const router = useRouter();

  const [name, setName] = useState(deck.name);
  const [renaming, setRenaming] = useState(false);
  const [cards, setCards] = useState<DeckCards>(deck.cards ?? {});
  const [notes, setNotes] = useState(deck.notes ?? "");
  const [visibility, setVisibility] = useState<DeckVisibility>(deck.visibility);
  const [zone, setZone] = useState<DeckTargetZone>(AUTO_ZONE);
  const [dragging, setDragging] = useState<DeckDrag | undefined>();
  const [tab, setTab] = useState<"visual" | "text">("visual");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [preview, setPreview] = useState<DeckCardInfo | undefined>();
  const [shareOpen, setShareOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [cover, setCover] = useState({
    coverCardId: deck.coverCardId,
    coverImageUrl: deck.coverImageUrl,
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<DateTime>(DateTime.fromJSDate(new Date(deck.updatedAt)));

  /**
   * Catalogue connu du navigateur : ce que le deck contenait à l'ouverture,
   * plus tout ce que la recherche et l'import de texte ont fait passer. Une
   * carte ajoutée doit s'afficher avec son illustration sans attendre un
   * rechargement de la page.
   */
  const [catalog, setCatalog] = useState<Map<string, DeckCardInfo>>(
    () => new Map(initialCatalog.map((card) => [card.id, card]))
  );

  const learnCards = useCallback((learned: DeckCardInfo[]) => {
    setCatalog((current) => {
      const next = new Map(current);
      for (const card of learned) {
        next.set(card.id, card);
      }
      return next;
    });
  }, []);

  /**
   * Exemplaires possédés, par nom : la collection se compte toutes impressions
   * confondues (`lib/decks/collection.ts`). Le serveur fournit ceux du deck à
   * l'ouverture ; ceux des cartes que la recherche fait passer se chargent au
   * fil de l'eau.
   */
  const [ownedByName, setOwnedByName] = useState<Map<string, number>>(() => {
    const byName = new Map<string, number>();
    for (const card of initialCatalog) {
      const owned = initialOwnedByCardId?.[card.id];
      if (owned !== undefined) byName.set(card.name, owned);
    }
    return byName;
  });
  const requestedNamesRef = useRef(new Set(ownedByName.keys()));
  // Un booléen plutôt que l'objet : un `router.refresh()` en renvoie un neuf,
  // qui relancerait sinon la recherche du catalogue.
  const hasCollection = initialOwnedByCardId !== undefined;

  const loadOwnership = useCallback(
    async (cardsToCount: DeckCardInfo[]) => {
      // Sans collection connue (visiteur, erreur au chargement), rien à compter.
      if (!hasCollection) return;

      const names = [...new Set(cardsToCount.map((card) => card.name))].filter(
        (name) => name && !requestedNamesRef.current.has(name)
      );
      if (names.length === 0) return;
      for (const name of names) requestedNamesRef.current.add(name);

      // La route plafonne le nombre de noms par requête : une liste collée de
      // cent cinquante cartes part en plusieurs fois.
      const batches: string[][] = [];
      for (let start = 0; start < names.length; start += OWNERSHIP_BATCH) {
        batches.push(names.slice(start, start + OWNERSHIP_BATCH));
      }

      const results = await Promise.all(
        batches.map(async (batch) => {
          const params = new URLSearchParams();
          for (const name of batch) params.append("names", name);

          const response = await fetch(`/api/collection/games/${gameSlug}/ownership?${params.toString()}`).catch(
            () => null
          );
          const data: { ownership?: Record<string, { total?: number }> } | null = response?.ok
            ? await response.json().catch(() => null)
            : null;
          if (!data) {
            // Une prochaine recherche retentera ces noms.
            for (const name of batch) requestedNamesRef.current.delete(name);
          }
          return { batch, data };
        })
      );

      setOwnedByName((current) => {
        const next = new Map(current);
        for (const { batch, data } of results) {
          if (!data) continue;
          for (const name of batch) next.set(name, data.ownership?.[name]?.total ?? 0);
        }
        return next;
      });
    },
    [gameSlug, hasCollection]
  );

  const ownedByCardId = useMemo(() => {
    if (!hasCollection) return undefined;

    const byId = new Map<string, number>();
    for (const card of catalog.values()) {
      const owned = ownedByName.get(card.name);
      if (owned !== undefined) byId.set(card.id, owned);
    }
    return byId;
  }, [catalog, hasCollection, ownedByName]);

  const ownedOf = useCallback((card: DeckCardInfo) => ownedByName.get(card.name), [ownedByName]);

  const [textDraft, setTextDraft] = useState(() =>
    stringifyDeckText(deck.cards, zones, (id) => initialCatalog.find((card) => card.id === id)?.name)
  );

  // Passer à l'onglet texte doit montrer le deck tel qu'il est maintenant, pas
  // tel qu'il était à l'ouverture de la page.
  useEffect(() => {
    if (tab === "text") {
      setTextDraft(stringifyDeckText(cards, zones, (id) => catalog.get(id)?.name));
    }
    // `cards` et `catalog` sont volontairement hors des dépendances : on fige
    // la liste au moment où l'onglet s'ouvre, sinon la saisie serait réécrite
    // sous les doigts à chaque frappe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, zones]);

  const changeQuantity = useCallback((target: DeckZoneKey, cardId: string, delta: number) => {
    setCards((current) => changeCardQuantity(current, target, cardId, delta));
    setDirty(true);
  }, []);

  const addFromCatalog = useCallback(
    (card: DeckCardInfo, delta: number) => {
      learnCards([card]);
      setCards((current) => {
        // En « Auto », la zone se décide sur le deck tel qu'il est à cet
        // instant : le premier champion devient le champion choisi, le
        // suivant va au deck principal. Retirer vise la zone qui porte la
        // carte, pas celle où un ajout la mettrait.
        const target =
          zone !== AUTO_ZONE
            ? zone
            : delta > 0
              ? routeCardToZone(card, zones, current)
              : zoneHoldingCard(card, zones, current);
        return target ? changeCardQuantity(current, target, card.id, delta) : current;
      });
      setDirty(true);
    },
    [learnCards, zone, zones]
  );

  const moveBetweenZones = useCallback(
    (from: DeckZoneKey, to: DeckZoneKey, cardId: string, quantity?: number) => {
      // La place se lit sur le deck affiché : c'est lui que l'auteur voit plein.
      const target = zones.find((candidate) => candidate.key === to);
      const max = target?.max;
      const room = max === undefined ? Infinity : Math.max(0, max - zoneCount(cards, to));
      if (room === 0) {
        toast.error("Zone pleine", {
          description: `${target?.label ?? to} ne prend pas plus de ${max} carte${max !== undefined && max > 1 ? "s" : ""}.`,
        });
        return;
      }

      setCards((current) => moveCard(current, from, to, cardId, quantity, room));
      setDirty(true);
    },
    [cards, zones]
  );

  const dropOnZone = useCallback(
    (target: DeckZoneKey, single: boolean) => {
      const drag = dragging;
      setDragging(undefined);
      if (!drag) return;

      if (drag.from) {
        moveBetweenZones(drag.from, target, drag.cardId, single ? 1 : undefined);
        return;
      }

      // Depuis le catalogue : un exemplaire, là où on l'a déposé.
      if (drag.card) learnCards([drag.card]);
      changeQuantity(target, drag.cardId, 1);
    },
    [changeQuantity, dragging, learnCards, moveBetweenZones]
  );

  /**
   * Version serveur à jour, y compris juste après un enregistrement.
   *
   * Une ref et non un état : elle ne redessine rien, et le prop `deck.version`
   * ne suffit pas — il ne revient qu'au `router.refresh()`, bien après le
   * second enregistrement possible. Même mécanique que le `revisionRef` de
   * l'éditeur d'échange.
   */
  const versionRef = useRef(deck.version ?? 1);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/decks/${deck.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || deck.name,
          cards,
          notes,
          // La liste texte suit le contenu structuré : c'est elle que lisent
          // les écrans et les exports qui ne connaissent pas encore les zones.
          decklist: stringifyDeckText(cards, zones, (id) => catalog.get(id)?.name),
          expectedVersion: versionRef.current,
        }),
      });

      const data = await response.json().catch(() => null);

      // Un autre onglet — ou le téléphone — a enregistré depuis l'ouverture de
      // celui-ci. Rien n'a été écrit : le travail en cours reste à l'écran, et
      // c'est à son auteur de décider. La version fraîche est adoptée, si bien
      // qu'un second clic écrase — délibérément, cette fois.
      if (response.status === 409 && data?.deck) {
        versionRef.current = data.deck.version ?? versionRef.current;
        toast.warning("Ce deck a été enregistré ailleurs", {
          description:
            "Vos modifications n'ont pas été écrasées. Enregistrez à nouveau pour imposer votre version, ou rechargez la page pour repartir de la sienne.",
        });
        return;
      }

      if (!response.ok) {
        toast.error("Enregistrement impossible", {
          description: data?.error ?? "Le deck n'a pas pu être enregistré.",
        });
        return;
      }

      if (typeof data?.version === "number") {
        versionRef.current = data.version;
      }

      setDirty(false);
      setSavedAt(DateTime.now());
      toast.success("Deck enregistré");
      router.refresh();
    } catch (error) {
      console.error("Error saving deck:", error);
      toast.error("Enregistrement impossible", { description: "Une erreur est survenue." });
    } finally {
      setSaving(false);
    }
  };

  // Fermer l'onglet sur un deck non enregistré doit demander confirmation : une
  // heure de construction ne disparaît pas sur un raccourci clavier.
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const total = deckSize(cards, zones);
  const activeZone = zone === AUTO_ZONE ? undefined : zones.find((entry) => entry.key === zone);
  // La couverture suit ce qui est à l'écran : la carte que l'on vient de
  // désigner s'affiche sans attendre le rechargement de la page.
  const currentCover = resolveDeckCover({ ...cover, legendCardId: deck.legendCardId }, catalog);

  const visibilityControl = (
    <SegmentedControl
      label="Visibilité du deck"
      size="sm"
      value={visibility}
      options={DECK_VISIBILITIES.map((key) => ({
        value: key,
        label: DECK_VISIBILITY_LABELS[key].label,
        hint: DECK_VISIBILITY_LABELS[key].hint,
      }))}
      onChange={async (next) => {
        const previous = visibility;
        setVisibility(next);

        const response = await fetch(`/api/decks/${deck.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: next }),
        }).catch(() => null);

        if (!response?.ok) {
          setVisibility(previous);
          toast.error("Visibilité non enregistrée");
        }
      }}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <nav className="text-[13px] text-muted-foreground">
          <Link href="/decks" className="hover:text-foreground">
            Mes decks
          </Link>
          {gameName && <> / {gameName}</>}
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            {renaming ? (
              <Input
                autoFocus
                value={name}
                maxLength={100}
                onChange={(event) => {
                  setName(event.target.value);
                  setDirty(true);
                }}
                onBlur={() => setRenaming(false)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === "Escape") setRenaming(false);
                }}
                className="h-auto py-0 text-3xl font-bold tracking-tight md:text-3xl"
                aria-label="Nom du deck"
              />
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRenaming(true)}
                  className="truncate text-left text-3xl font-bold tracking-tight"
                >
                  {name}
                </button>
                <span className="shrink-0 rounded-full border border-dashed px-2 py-0.5 text-xs text-muted-foreground">
                  cliquer pour renommer
                </span>
              </div>
            )}

            <p className="text-[13px] text-muted-foreground">
              {[
                deck.format,
                dirty ? "modifications non enregistrées" : `enregistré ${savedAt.setLocale("fr").toRelative()}`,
                `v${deck.version ?? 1}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="hidden lg:inline-flex">{visibilityControl}</span>
            <span className="lg:hidden">
              <DeckVisibilityBadge visibility={visibility} />
            </span>
            <DeckCoverButton onClick={() => setCoverOpen(true)} cover={currentCover} />
            <Button type="button" variant="outline" onClick={() => setShareOpen(true)}>
              <Share2 />
              Partager
            </Button>
            <Button type="button" onClick={save} disabled={saving || !dirty}>
              {saving && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
            <DeleteDeckButton deckId={deck.id} />
          </div>
        </div>

        <div className="lg:hidden">{visibilityControl}</div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(220px,340px)_minmax(300px,1fr)_minmax(220px,304px)] xl:items-start">
        <div className="xl:sticky xl:top-4 xl:order-1">
          <DeckCatalog
            gameSlug={gameSlug}
            zones={zones}
            zone={zone}
            onZoneChangeAction={setZone}
            onAddAction={addFromCatalog}
            onPreviewAction={setPreview}
            ownedOf={ownedByCardId ? ownedOf : undefined}
            onResultsAction={loadOwnership}
            onDragStartAction={setDragging}
            onDragEndAction={() => setDragging(undefined)}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:order-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                label="Mode de saisie"
                value={tab}
                options={[
                  { value: "visual", label: "Visuel" },
                  { value: "text", label: "Texte" },
                ]}
                onChange={setTab}
              />
              {tab === "visual" && (
                <SegmentedControl
                  label="Densité d'affichage"
                  value={view}
                  options={[
                    { value: "grid", label: "Grille", icon: <LayoutGrid className="size-3.5" /> },
                    { value: "list", label: "Liste", icon: <List className="size-3.5" /> },
                  ]}
                  onChange={setView}
                />
              )}
            </div>
            <span className="text-sm text-muted-foreground">
              {total} carte{total > 1 ? "s" : ""} au total
            </span>
          </div>

          {tab === "visual" ? (
            <DeckZonesEditor
              cards={cards}
              zones={zones}
              cardsById={catalog}
              view={view}
              ownedByCardId={ownedByCardId}
              dragging={dragging}
              onChangeAction={changeQuantity}
              onMoveAction={moveBetweenZones}
              onDragStartAction={setDragging}
              onDragEndAction={() => setDragging(undefined)}
              onDropAction={dropOnZone}
              onPreviewAction={setPreview}
            />
          ) : (
            <DeckTextTab
              value={textDraft}
              onValueChangeAction={setTextDraft}
              zones={zones}
              gameSlug={gameSlug}
              currentCards={cards}
              onApplyAction={(applied, learned) => {
                learnCards(learned);
                void loadOwnership(learned);
                // Les zones changées par la liste, déjà fusionnées avec le deck en cours.
                setCards((current) => ({ ...current, ...applied }));
                setDirty(true);
                setTab("visual");
              }}
            />
          )}
        </div>

        <div className="xl:sticky xl:top-4 xl:order-3">
          <DeckPanels
            cards={cards}
            zones={zones}
            cardsById={catalog}
            notes={notes}
            onNotesChangeAction={(value) => {
              setNotes(value);
              setDirty(true);
            }}
            ownedByCardId={ownedByCardId}
            version={deck.version ?? 1}
            updatedAt={savedAt.setLocale("fr").toFormat("dd/MM/yyyy")}
            copyLimit={copyLimit}
            preview={preview}
          />
        </div>
      </div>

      {/* Barre d'action basse : sur téléphone, « Enregistrer » ne doit pas être
          à deux écrans de défilement de la carte que l'on vient d'ajouter. */}
      <div className="sticky bottom-0 z-40 -mx-4 flex items-center gap-2 border-t bg-muted/50 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-muted/70 xl:hidden">
        <span className={cn("min-w-0 flex-1 truncate text-xs text-muted-foreground")}>
          {activeZone ? `Ajouts vers « ${activeZone.label} »` : "Ajouts rangés selon le type de carte"}
        </span>
        <Button type="button" className="h-11 shrink-0" onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2 className="animate-spin" />}
          Enregistrer
        </Button>
      </div>

      <DeckCoverDialog
        open={coverOpen}
        onOpenChange={setCoverOpen}
        deckId={deck.id}
        deckName={name}
        cards={cards}
        zones={zones}
        cardsById={catalog}
        coverCardId={cover.coverCardId}
        coverImageUrl={cover.coverImageUrl}
        legendCardId={deck.legendCardId}
        onApplyAction={async (choice) => {
          // Sans `expectedVersion` : choisir une couverture n'entre pas en
          // concurrence avec la construction du deck, et refuser ce choix
          // parce qu'un autre onglet a enregistré une carte n'aiderait
          // personne.
          const response = await fetch(`/api/decks/${deck.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(choice),
          }).catch(() => null);

          if (!response?.ok) {
            const data = await response?.json().catch(() => null);
            toast.error("Couverture non enregistrée", { description: data?.error });
            return false;
          }

          setCover({
            coverCardId: choice.coverCardId || undefined,
            coverImageUrl: choice.coverImageUrl || undefined,
          });
          toast.success("Couverture mise à jour");
          router.refresh();
          return true;
        }}
      />

      <ShareDeckDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        deckId={deck.id}
        deckName={name}
        visibility={visibility}
        exportCode={exportCode}
        onVisibilityChangeAction={async (next) => {
          const response = await fetch(`/api/decks/${deck.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ visibility: next }),
          }).catch(() => null);

          if (response?.ok) {
            setVisibility(next);
            toast.success("Visibilité mise à jour");
          } else {
            toast.error("Visibilité non enregistrée");
          }
        }}
      />
    </div>
  );
}
