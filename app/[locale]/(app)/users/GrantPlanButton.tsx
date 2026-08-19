"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Gift, Trash2 } from "lucide-react";
import {
  SUBSCRIPTION_PLAN_OPTIONS,
  type SubscriptionPlanKey,
} from "@/lib/constants/subscription-plans.ts";
import type { GrantedPlan } from "@/lib/types/Subscription.ts";
import { grantPlanToUserAction, revokeGrantedPlanFromUserAction } from "./admin-actions.ts";

/**
 * Offrir un palier à un compte, ou retirer un palier offert.
 *
 * Réservé aux administrateurs — le vrai contrôle est dans l'action serveur, ce
 * bouton n'est qu'une commodité.
 *
 * Le motif est **obligatoire** : dans six mois, « pourquoi cette boutique a-t-elle
 * Pro gratuitement ? » sera une vraie question, et un champ vide n'y répondra
 * pas. C'est la seule contrainte du formulaire.
 */
export default function GrantPlanButton({
  userId,
  userTag,
  grantedPlans,
  paidPlans,
}: {
  userId: string;
  userTag: string;
  grantedPlans: GrantedPlan[];
  paidPlans: SubscriptionPlanKey[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<SubscriptionPlanKey | "">("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const dejaOfferts = new Set(grantedPlans.map((granted) => granted.plan));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Gift className="mr-2 h-4 w-4" />
          Offrir un palier
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Offrir un palier à {userTag}</DialogTitle>
          <DialogDescription>
            Le palier offert ouvre exactement les mêmes droits qu&apos;un palier payé, et
            survit aux synchronisations Patreon.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {grantedPlans.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Paliers déjà offerts</p>
              <ul className="space-y-2">
                {grantedPlans.map((granted) => (
                  <li
                    key={granted.plan}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <span className="space-x-2">
                      <Badge variant="outline">{granted.plan}</Badge>
                      <span className="text-muted-foreground">{granted.reason}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const result = await revokeGrantedPlanFromUserAction(userId, granted.plan);
                          if (result.success) {
                            toast.success("Palier retiré.");
                            router.refresh();
                          } else {
                            toast.error("Le retrait a échoué.");
                          }
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Palier à offrir</p>
            <Select value={plan} onValueChange={(value) => setPlan(value as SubscriptionPlanKey)}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un palier" />
              </SelectTrigger>
              <SelectContent>
                {SUBSCRIPTION_PLAN_OPTIONS.filter((option) => !dejaOfferts.has(option.value)).map(
                  (option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                      {/* Dire que Patreon l'accorde déjà, sans l'interdire :
                          l'abonnement peut cesser, et l'octroi devient alors la
                          raison pour laquelle la personne le garde. */}
                      {paidPlans.includes(option.value) ? " — déjà actif via Patreon" : ""}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Motif</p>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Boutique partenaire, bêta-testeur…"
            />
          </div>

          <Button
            className="w-full"
            disabled={pending || !plan || reason.trim().length === 0}
            onClick={() =>
              startTransition(async () => {
                const result = await grantPlanToUserAction(userId, plan as SubscriptionPlanKey, reason);
                if (result.success) {
                  toast.success("Palier offert.");
                  setPlan("");
                  setReason("");
                  setOpen(false);
                  router.refresh();
                } else if (result.error === "already-granted") {
                  toast.error("Ce palier lui est déjà offert.");
                } else {
                  toast.error("L'attribution a échoué.");
                }
              })
            }
          >
            Offrir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
