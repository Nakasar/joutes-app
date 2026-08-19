"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import type { QuizBlock } from "@/lib/types/Quiz.ts";

const MAX_TEXT_LENGTH = 20000;

type Props = {
  /** Jeu rattaché au quizz : sans lui, les noms de cartes ne sont pas détectés. */
  gameId: string;
  /** Le brouillon est ajouté au formulaire, jamais publié directement. */
  onImported: (draft: { title: string; blocks: QuizBlock[] }) => void;
};

/**
 * Construit un brouillon de quizz à partir d'un texte libre — fil de règles,
 * question du jour, FAQ. Le texte est analysé par un modèle, qui en tire les
 * questions et leurs réponses ; les noms de cartes y sont ensuite mis entre
 * crochets comme le fait la loupe, pour qu'ils deviennent des liens à la
 * lecture du quizz.
 *
 * Le résultat n'est qu'un point de départ : il atterrit dans le formulaire, où
 * il est relu et corrigé avant publication.
 */
export default function QuizImportDialog({ gameId, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const trimmed = text.trim();
    if (!trimmed) {
      toast.error("Collez un texte à analyser");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/quizzes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, gameId: gameId || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "L'analyse du texte a échoué");
        return;
      }

      const questionCount = (data.blocks as QuizBlock[]).reduce(
        (total, block) => total + (block.type === "form" ? block.questions.length : 0),
        0
      );

      onImported({ title: data.title, blocks: data.blocks });
      setText("");
      setOpen(false);
      toast.success(
        `${questionCount} question${questionCount === 1 ? "" : "s"} importée${questionCount === 1 ? "" : "s"} — relisez avant de publier.`
      );
    } catch {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Sparkles className="h-4 w-4 mr-2" />
          Importer depuis un texte
        </Button>
      </DialogTrigger>
      {/*
        La fenêtre ne dépasse jamais l'écran : c'est son corps qui défile, pas
        elle. Sans cette borne, un texte collé de plusieurs milliers de
        caractères poussait le bouton d'analyse hors de l'écran — une fenêtre
        modale est en position fixe, la page derrière ne la fait pas défiler,
        et il n'y avait plus aucun moyen de l'atteindre.
      */}
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer un quizz depuis un texte</DialogTitle>
          <DialogDescription>
            Collez un texte — fil de règles, question du jour, FAQ. Les questions et leurs réponses en sont
            tirées automatiquement, et les blocs obtenus sont ajoutés au formulaire pour relecture.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {/*
            `field-sizing-fixed` : la zone de saisie garde la hauteur de ses
            quatorze lignes au lieu de grandir avec ce qu'on y colle, et se
            réduit sur un écran bas. C'est elle qui défile, pas la fenêtre.
          */}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Collez ici le texte à transformer en quizz…"
            rows={14}
            maxLength={MAX_TEXT_LENGTH}
            disabled={loading}
            className="field-sizing-fixed max-h-[45dvh]"
          />
          <p className="text-xs text-muted-foreground">
            {gameId
              ? "Les noms de cartes du jeu rattaché seront mis entre crochets, comme avec la loupe."
              : "Rattachez un jeu au quizz avant l'import pour que les noms de cartes soient détectés."}{" "}
            {text.length}/{MAX_TEXT_LENGTH} caractères.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Annuler
          </Button>
          <Button type="button" onClick={handleImport} disabled={loading || !text.trim()}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading ? "Analyse en cours…" : "Analyser le texte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
