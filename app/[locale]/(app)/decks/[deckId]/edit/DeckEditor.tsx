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
import { DeckVisibilityBadge } from "@/components/decks/DeckBadges.tsx";
import { cn } from "@/lib/utils.ts";
import {
  changeCardQuantity,
  deckSize,
  type DeckCardInfo,
  type DeckCards,
} from "@/lib/decks/contents.ts";
import { stringifyDeckText } from "@/lib/decks/text.ts";
import { defaultDeckZone, type DeckZone, type DeckZoneKey } from "@/lib/decks/zones.ts";
import { DECK_VISIBILITIES, DECK_VISIBILITY_LABELS, type Deck, type DeckVisibility } from "@/lib/types/Deck.ts";
import { DeckCatalog } from "./DeckCatalog.tsx";
import { DeckPanels } from "./DeckPanels.tsx";
import { DeckTextTab } from "./DeckTextTab.tsx";
import { DeckZonesEditor } from "./DeckZonesEditor.tsx";
import DeleteDeckButton from "../DeleteDeckButton.tsx";

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
  const [zone, setZone] = useState<DeckZoneKey>(defaultDeckZone(zones));
  const [tab, setTab] = useState<"visual" | "text">("visual");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [preview, setPreview] = useState<DeckCardInfo | undefined>();
  const [shareOpen, setShareOpen] = useState(false);
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

  const ownedByCardId = useMemo(
    () => (initialOwnedByCardId ? new Map(Object.entries(initialOwnedByCardId)) : undefined),
    [initialOwnedByCardId]
  );

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
      changeQuantity(zone, card.id, delta);
    },
    [changeQuantity, learnCards, zone]
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
  const activeZone = zones.find((entry) => entry.key === zone);

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
              onChangeAction={changeQuantity}
              onPreviewAction={setPreview}
            />
          ) : (
            <DeckTextTab
              value={textDraft}
              onValueChangeAction={setTextDraft}
              zones={zones}
              gameSlug={gameSlug}
              onApplyAction={(applied, learned) => {
                learnCards(learned);
                // Seules les zones nommées par la liste sont remplacées : coller
                // une réserve ne doit pas effacer le deck principal.
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
          {activeZone ? `Ajouts vers « ${activeZone.label} »` : ""}
        </span>
        <Button type="button" className="h-11 shrink-0" onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2 className="animate-spin" />}
          Enregistrer
        </Button>
      </div>

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
