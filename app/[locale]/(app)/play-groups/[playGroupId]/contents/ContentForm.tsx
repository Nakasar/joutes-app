"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import type { PlayGroupContentItem, PlayGroupContentKind } from "@/lib/types/PlayGroup";

import {
  createPlayGroupContent,
  deletePlayGroupContent,
  updatePlayGroupContent,
  type PlayGroupActionResult,
} from "../actions.ts";

const KINDS: PlayGroupContentKind[] = ["video", "article", "replay"];

/**
 * L'écriture d'un contenu : un article, une vidéo, un replay.
 *
 * Un seul formulaire pour les trois, parce que c'est une seule carte sur la
 * vitrine. Ce qui change, c'est le champ qui porte la matière : un article
 * s'écrit ici en markdown, une vidéo et un replay ne sont qu'une adresse
 * Twitch ou YouTube. Le formulaire montre l'un ou l'autre plutôt que les deux
 * avec l'un barré.
 */
export default function ContentForm({
  playGroupId,
  games,
  content,
  canDelete,
}: {
  playGroupId: string;
  games: { id: string; name: string }[];
  /** Absent à la création. */
  content?: PlayGroupContentItem;
  canDelete?: boolean;
}) {
  const t = useTranslations("PlayGroups.hub.contents");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<PlayGroupContentKind>(content?.kind ?? "article");
  const [title, setTitle] = useState(content?.title ?? "");
  const [summary, setSummary] = useState(content?.summary ?? "");
  const [body, setBody] = useState(content?.body ?? "");
  const [url, setUrl] = useState(content?.url ?? "");
  const [thumbnail, setThumbnail] = useState(content?.thumbnail ?? "");
  const [duration, setDuration] = useState(content?.duration ?? "");
  const [gameId, setGameId] = useState(content?.gameId ?? "");

  const back = () => router.push(`/play-groups/${playGroupId}/contents`);

  const report = (result: PlayGroupActionResult) => {
    if (result.success) {
      back();
      return;
    }

    toast.error(t(result.error === "INVALID" ? "invalid" : "error"));
  };

  const onSubmit = () => {
    const payload = { kind, title, summary, body, url, thumbnail, duration, gameId };

    startTransition(async () => {
      report(
        content
          ? await updatePlayGroupContent(playGroupId, content.id, payload)
          : await createPlayGroupContent(playGroupId, payload),
      );
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1 self-start rounded-[9px] border p-1">
        {KINDS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={cn(
              "rounded-[6px] px-3 py-1.5 text-[13px] transition-colors",
              kind === value
                ? "bg-[var(--group-accent-16)] font-semibold text-[var(--group-accent-text)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`kind.${value}`)}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="content-title">{t("titleLabel")}</Label>
        <Input
          id="content-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("titlePlaceholder")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="content-summary">{t("summaryLabel")}</Label>
        <Input
          id="content-summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder={t("summaryPlaceholder")}
        />
      </div>

      {kind === "article" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-body">{t("bodyLabel")}</Label>
          <Textarea
            id="content-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("bodyPlaceholder")}
            rows={16}
            className="font-mono text-[13px]"
          />
          <p className="text-xs text-muted-foreground">{t("bodyHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-url">{t("urlLabel")}</Label>
          <Input
            id="content-url"
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t("urlPlaceholder")}
          />
          <p className="text-xs text-muted-foreground">{t("urlHint")}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-thumbnail">{t("thumbnailLabel")}</Label>
          <Input
            id="content-thumbnail"
            type="url"
            value={thumbnail}
            onChange={(event) => setThumbnail(event.target.value)}
            placeholder="https://…"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-duration">{t("durationLabel")}</Label>
          <Input
            id="content-duration"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            placeholder={t("durationPlaceholder")}
          />
        </div>
      </div>

      {games.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="content-game">{t("gameLabel")}</Label>
          <select
            id="content-game"
            value={gameId}
            onChange={(event) => setGameId(event.target.value)}
            className="h-9 rounded-md border bg-transparent px-3 text-sm"
          >
            <option value="">{t("gameNone")}</option>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-5">
        {content && canDelete && (
          <Button
            variant="outline"
            size="sm"
            className="mr-auto"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                report(await deletePlayGroupContent(playGroupId, content.id));
              })
            }
          >
            <Trash2 aria-hidden />
            {t("delete")}
          </Button>
        )}

        <Button variant="outline" size="sm" disabled={pending} onClick={back}>
          {t("cancel")}
        </Button>
        <Button size="sm" disabled={pending || title.trim().length === 0} onClick={onSubmit}>
          {content ? t("save") : t("publish")}
        </Button>
      </div>
    </div>
  );
}
