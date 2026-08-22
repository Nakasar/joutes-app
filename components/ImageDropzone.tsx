"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * Le dépôt d'une image, avec son aperçu.
 *
 * Le composant ne connaît que l'URL : il dépose le fichier, rend l'URL
 * obtenue, et c'est à l'écran de décider quoi en faire. C'est ce qui lui
 * permet de servir aussi bien au logo d'un lieu qu'à sa bannière, aux visuels
 * de ses annonces, aux photos de sa galerie — et à l'avatar comme à la
 * bannière d'un compte.
 *
 * La route de dépôt et ses champs sont **passés**, pas devinés : le droit
 * d'écrire une image se vérifie sur la ressource, et chaque ressource a la
 * sienne (`/api/lairs/[lairId]/upload`, `/api/users/me/upload`). Les deux
 * libellés d'erreur le sont aussi, pour que le composant n'ait pas à connaître
 * l'espace de noms de traduction de l'écran qui l'emploie.
 */
export default function ImageDropzone({
  value,
  onChange,
  uploadUrl,
  extraFields,
  label,
  hint,
  labels,
  disabled,
  className,
  previewClassName,
}: {
  value?: string;
  onChange: (url: string | undefined) => void;
  /** La route qui reçoit le fichier, et qui vérifie le droit d'écrire ici. */
  uploadUrl: string;
  /** Champs de formulaire supplémentaires — « quelle image » pour un compte. */
  extraFields?: Record<string, string>;
  label: string;
  hint?: string;
  labels: { failed: string; remove: string };
  disabled?: boolean;
  className?: string;
  previewClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setIsUploading(true);

    try {
      const body = new FormData();
      body.append("file", file);
      for (const [key, fieldValue] of Object.entries(extraFields ?? {})) {
        body.append(key, fieldValue);
      }

      const response = await fetch(uploadUrl, { method: "POST", body });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload.error ?? labels.failed);
        return;
      }

      onChange(payload.url);
    } catch {
      setError(labels.failed);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-lg border border-dashed text-center transition-colors",
          disabled ? "opacity-50" : "hover:border-foreground/30",
          previewClassName ?? "h-28",
        )}
      >
        {value ? (
          <>
            <Image src={value} alt="" fill className="object-cover" sizes="400px" />
            {!disabled && (
              <Button
                type="button"
                size="icon"
                variant="secondary"
                aria-label={labels.remove}
                className="absolute top-1.5 right-1.5 size-7"
                onClick={() => onChange(undefined)}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={disabled || isUploading}
            onClick={() => inputRef.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1 p-3 text-xs text-muted-foreground disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Upload className="size-4" aria-hidden />
            )}
            <span className="font-mono text-[11px]">{label}</span>
            {hint && <span className="font-mono text-[10px] opacity-70">{hint}</span>}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void upload(file);
          }
          event.target.value = "";
        }}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
