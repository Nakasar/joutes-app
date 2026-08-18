"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, Clipboard, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Props = {
  title: string;
  /**
   * Texte de la liste. Il n'est demandé qu'à l'ouverture : la page du cube ne
   * charge pas toutes ses cartes pour un bouton qui peut rester inutilisé.
   */
  getText: () => string | Promise<string>;
  triggerLabel: string;
  /** Nom du fichier proposé au téléchargement, sans extension. */
  fileName: string;
};

/**
 * Liste de cartes d'un paquet ou d'un cube, à copier ou à télécharger. Partagée
 * par la page du cube et l'éditeur de paquet, pour que les deux exports rendent
 * exactement le même format.
 */
export default function ExportCardListDialog({ title, getText, triggerLabel, fileName }: Props) {
  const t = useTranslations("Cubes");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  const handleOpenChange = async (next: boolean) => {
    setOpen(next);
    if (!next) {
      return;
    }

    setCopied(false);
    setLoading(true);
    try {
      setText(await getText());
    } catch {
      setText("");
      toast.error(t("export.error"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(t("export.copied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("export.error"));
    }
  };

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    // Le nom du paquet ou du cube est libre : il est ramené à un nom de fichier.
    link.download = `${fileName.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "cards"}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      {/* Bornée à l'écran : la liste produite fait la taille du paquet, et
          la zone de texte suivrait sa hauteur sans limite. */}
      <DialogContent className="flex max-h-[85dvh] flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t("export.description")}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Textarea
            readOnly
            value={text}
            rows={14}
            placeholder={t("export.empty")}
            className="field-sizing-fixed max-h-[55dvh] min-h-0 font-mono text-xs"
            onFocus={(e) => e.target.select()}
          />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={handleDownload} disabled={!text} className="gap-2">
            <Download className="size-4" />
            {t("export.download")}
          </Button>
          <Button onClick={handleCopy} disabled={!text} className="gap-2">
            {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
            {t("export.copy")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
