"use client";

import { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/auth-client";
import { reportContent } from "@/app/[locale]/(app)/reports/actions";
import { ReportableContentType } from "@/lib/types/Report";
import { cn } from "@/lib/utils";

const MAX_REASON_LENGTH = 1000;

/**
 * Bouton « drapeau » de signalement d'un contenu créé ou modifié par les
 * utilisateurs. Il n'est affiché qu'aux utilisateurs connectés : la
 * modération repose sur l'identité de la personne qui signale.
 */
export default function ReportButton({
  contentType,
  contentId,
  variant = "ghost",
  size = "icon-sm",
  className,
  withLabel = false,
}: {
  contentType: ReportableContentType;
  contentId: string;
  variant?: "ghost" | "outline";
  size?: "sm" | "icon-sm";
  className?: string;
  /** Affiche le libellé « Signaler » à côté du drapeau. */
  withLabel?: boolean;
}) {
  const t = useTranslations("Reports");
  const { data: session, isPending: isSessionPending } = useSession();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Le premier rendu du navigateur doit reproduire celui du serveur, qui ne
  // rend rien : `useSession` sert la session depuis son cache **dès la première
  // passe** côté client, si bien que React comparait un bouton à du vide et
  // rejetait l'hydratation de tout l'arbre au-dessus. Attendre le montage
  // aligne les deux, au prix d'une image d'attente pour qui est connecté.
  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => setHasMounted(true), []);

  if (!hasMounted || isSessionPending || !session?.user) {
    return null;
  }

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      const result = await reportContent({
        contentType,
        contentId,
        reason: reason.trim() || undefined,
      });

      if (!result.success) {
        toast.error(result.error ?? t("error"));
        return;
      }

      toast.success(result.alreadyReported ? t("alreadyReported") : t("success"));
      setReason("");
      setOpen(false);
    } catch (error) {
      console.error("Erreur lors du signalement:", error);
      toast.error(t("error"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={withLabel ? "sm" : size}
        className={cn("text-muted-foreground hover:text-destructive", className)}
        title={t("button")}
        aria-label={t("button")}
        onClick={() => setOpen(true)}
      >
        <Flag className="h-4 w-4" />
        {withLabel && <span>{t("button")}</span>}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            <Label htmlFor="report-reason">{t("reasonLabel")}</Label>
            <Textarea
              id="report-reason"
              value={reason}
              maxLength={MAX_REASON_LENGTH}
              placeholder={t("reasonPlaceholder")}
              onChange={(event) => setReason(event.target.value)}
              disabled={isSubmitting}
              className="max-h-[40dvh]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? t("submitting") : t("submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
