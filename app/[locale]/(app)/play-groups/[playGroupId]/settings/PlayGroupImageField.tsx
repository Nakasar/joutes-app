"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * Le choix d'une image du groupe : emblème ou bannière.
 *
 * Un fichier, pas une adresse. Coller l'URL d'une image hébergée ailleurs
 * paraissait plus simple, mais la moitié de ces adresses finit par disparaître
 * ou par changer sans prévenir, et `next.config.ts` ne déclare qu'un seul hôte
 * distant. Téléverser met l'image là où l'application sait la servir.
 *
 * L'aperçu est le contrôle : c'est lui qu'on clique pour remplacer, avec le
 * cadrage réel — carré pour l'emblème, panoramique pour la bannière — plutôt
 * qu'un champ de texte qui ne montre rien.
 */
export default function PlayGroupImageField({
  playGroupId,
  label,
  hint,
  value,
  onChange,
  shape,
}: {
  playGroupId: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  /** L'emblème est carré, la bannière panoramique — l'aperçu montre le vrai cadrage. */
  shape: "square" | "banner";
}) {
  const t = useTranslations("PlayGroups.hub.settings");
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(`/api/play-groups/${playGroupId}/images`, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.error || t("uploadError"));
        return;
      }

      onChange(payload.url);
    } catch {
      toast.error(t("uploadError"));
    } finally {
      setUploading(false);
      // Le même fichier rechoisi doit relancer un téléversement : sans cette
      // remise à zéro, `change` ne se déclenche pas deux fois de suite.
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={`image-${shape}`}>{label}</Label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label={value ? t("uploadReplace") : t("uploadChoose")}
          className={cn(
            "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-dashed bg-background/40 transition-colors hover:border-[var(--group-accent-40)] hover:bg-accent",
            shape === "square" ? "size-20" : "h-20 w-40",
          )}
        >
          {value ? (
            // Une balise nue : l'image vient d'être téléversée sur le stockage
            // blob, mais un groupe d'avant ce changement peut encore porter une
            // adresse tierce, que le composant image de Next refuserait.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
          )}

          {uploading && (
            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </span>
          )}
        </button>

        <div className="flex min-w-[12rem] flex-1 flex-col gap-2">
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? t("uploading") : value ? t("uploadReplace") : t("uploadChoose")}
            </Button>

            {value && (
              <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={() => onChange("")}>
                <X aria-hidden />
                {t("uploadRemove")}
              </Button>
            )}
          </div>

          <p className="font-mono text-[11px] text-muted-foreground">{t("uploadFormats")}</p>
        </div>
      </div>

      <input
        id={`image-${shape}`}
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
        }}
      />
    </div>
  );
}
