"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button.tsx";
import { gameLink, GAME_LINK_KEYS, type GameLinkKey } from "@/lib/constants/game-links.ts";
import { readYouTubeChannelRef } from "@/lib/streams/youtube-channels.ts";
import type { Game } from "@/lib/types/Game.ts";

import { updateGameLinks } from "../actions.ts";

const FIELD_CLASS =
  "w-full px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

/**
 * Le site de l'éditeur et ses réseaux.
 *
 * N'envoie que `links` : `setGameLinks` fusionne et ne touche à rien d'autre,
 * si bien que cet onglet ne recouvre pas le travail des autres. Une clé posée à
 * la main en base et absente de la table survit aussi à un enregistrement — le
 * formulaire ne la montre pas, il ne l'efface pas non plus.
 *
 * Un champ vidé vaut « retirer ce lien » : c'est le seul geste possible, et le
 * refuser au motif que la chaîne est vide rendrait un lien impossible à
 * enlever.
 */
export function GameLinksForm({ game }: { game: Game }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState<Record<GameLinkKey, string>>(() =>
    Object.fromEntries(GAME_LINK_KEYS.map((key) => [key, game.links?.[key] ?? ""])) as Record<
      GameLinkKey,
      string
    >,
  );

  /*
   * Le lien YouTube fait autre chose qu'ouvrir une page : c'est la chaîne que
   * le cron interroge. Une adresse de vidéo y ressemble assez pour être collée
   * par mégarde, et rien ne le signalerait avant qu'un direct n'apparaisse
   * jamais — d'où l'avertissement, posé à la saisie plutôt qu'à l'échec.
   */
  const youtube = form.youtube.trim();
  const youtubeIsChannel = youtube.length === 0 || readYouTubeChannelRef(youtube) !== null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await updateGameLinks(game.id, form);

      setMessage(
        result.success
          ? { ok: true, text: "Liens enregistrés." }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
      );
    });
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="bg-card space-y-4 rounded-lg p-6 shadow-md">
        <div>
          <h2 className="text-foreground text-lg font-semibold">Site et réseaux de l&apos;éditeur</h2>
          <p className="text-muted-foreground text-sm">
            Affichés sur la fiche publique du jeu. Un champ vidé retire le lien.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GAME_LINK_KEYS.map((key) => {
            const { label, placeholder, note } = gameLink(key);

            return (
              <div key={key}>
                <label
                  htmlFor={`game-link-${key}`}
                  className="text-foreground mb-1 block text-sm font-medium"
                >
                  {label}
                </label>
                <input
                  id={`game-link-${key}`}
                  type="url"
                  inputMode="url"
                  value={form[key]}
                  placeholder={placeholder}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className={FIELD_CLASS}
                />
                {note && <p className="text-muted-foreground mt-1 text-xs">{note}</p>}
                {key === "youtube" && !youtubeIsChannel && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                    Cette adresse n&apos;est pas celle d&apos;une chaîne : le lien s&apos;affichera,
                    mais aucun direct ne sera détecté.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer les liens"}
        </Button>
      </div>
    </form>
  );
}
