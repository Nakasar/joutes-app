"use client";

import { useState } from "react";
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
import { reportContent } from "@/app/reports/actions";
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

  if (isSessionPending || !session?.user) {
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
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="report-reason">{t("reasonLabel")}</Label>
            <Textarea
              id="report-reason"
              value={reason}
              maxLength={MAX_REASON_LENGTH}
              placeholder={t("reasonPlaceholder")}
              onChange={(event) => setReason(event.target.value)}
              disabled={isSubmitting}
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
