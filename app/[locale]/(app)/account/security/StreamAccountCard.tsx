"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Loader2, Plus, Radio, Trash2, Tv, Youtube } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { authClient } from "@/lib/auth-client.ts";
import type { StreamPlatform, StreamSubscriptionState, StreamTarget } from "@/lib/types/StreamLink";

import {
  addStreamTarget,
  removeStreamTarget,
  unlinkStreamAccount,
  type StreamActionError,
} from "./stream-actions.ts";

/**
 * Une plateforme de direct, sur l'écran « Connexions et comptes ».
 *
 * La carte raconte une progression, dans cet ordre : **lier le compte**, puis
 * **choisir où le direct s'annonce**, puis **voir ce qui est annoncé**. Chaque
 * étape n'apparaît qu'une fois la précédente franchie — proposer des
 * destinations à qui n'a pas encore lié son compte ne mènerait nulle part.
 *
 * L'annonce automatique n'a rien à régler au-delà de cette liste : pas
 * d'interrupteur, pas de bouton « démarrer ». Une destination inscrite *est* le
 * réglage, et l'enlever suffit à tout arrêter.
 */

const PLATFORM_LABELS: Record<StreamPlatform, string> = {
  twitch: "Twitch",
  youtube: "YouTube",
};

/** Les échecs des actions serveur, traduits ici — elles ne rendent que des codes. */
const ERROR_MESSAGES: Record<StreamActionError, string> = {
  UNAUTHENTICATED: "Votre session a expiré. Reconnectez-vous.",
  NOT_LINKED: "Ce compte n'est plus lié.",
  INVALID: "Cette destination n'est pas valide.",
  FORBIDDEN: "Vous n'avez plus le droit d'annoncer sur cette destination.",
  ALREADY_ADDED: "Cette destination est déjà dans la liste.",
  TOO_MANY_TARGETS: "Vous avez atteint le nombre maximal de destinations.",
  FAILED: "L'opération a échoué. Réessayez dans un instant.",
};

const SUBSCRIPTION_LABELS: Record<StreamSubscriptionState, { label: string; hint: string }> = {
  idle: {
    label: "Inactive",
    hint: "Ajoutez une destination pour que vos directs s'y annoncent automatiquement.",
  },
  pending: {
    label: "En cours d'activation",
    hint: "La plateforme confirme l'écoute, cela prend en général quelques secondes.",
  },
  active: {
    label: "Active",
    hint: "Vos directs s'annonceront automatiquement sur les destinations ci-dessous.",
  },
  failed: {
    label: "En erreur",
    hint: "L'écoute n'a pas pu être établie. Elle sera retentée automatiquement.",
  },
};

export type StreamTargetView = {
  target: StreamTarget;
  label: string;
};

export type StreamAccountCardProps = {
  platform: StreamPlatform;
  /** Le compte social est-il lié ? */
  linked: boolean;
  /** La plateforme est-elle configurée sur ce déploiement ? */
  oauthConfigured: boolean;
  /** L'annonce automatique est-elle disponible sur ce déploiement ? */
  listeningConfigured: boolean;
  channelName?: string;
  channelUrl?: string;
  subscriptionState: StreamSubscriptionState;
  targets: StreamTargetView[];
  /** Les lieux et groupes où ce compte peut annoncer, hors ceux déjà choisis. */
  available: StreamTargetView[];
  live?: { url: string; title?: string; startedAt: string } | null;
};

export default function StreamAccountCard({
  platform,
  linked,
  oauthConfigured,
  listeningConfigured,
  channelName,
  channelUrl,
  subscriptionState,
  targets,
  available,
  live,
}: StreamAccountCardProps) {
  const [selected, setSelected] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const name = PLATFORM_LABELS[platform];
  const Icon = platform === "twitch" ? Tv : Youtube;

  const run = (action: () => Promise<{ success: true } | { success: false; error: StreamActionError }>, done: string) => {
    startTransition(async () => {
      const result = await action();

      if (result.success) {
        toast.success(done);
        setSelected("");
      } else {
        toast.error(ERROR_MESSAGES[result.error]);
      }
    });
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {name}
        </CardTitle>
        <CardDescription>
          {linked
            ? "Votre compte est lié : il ouvre la connexion à Joutes et peut annoncer vos directs."
            : `Liez votre compte ${name} pour vous connecter avec et annoncer vos directs automatiquement.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              {linked ? (channelName ?? "Compte lié") : "Non connecté."}
            </p>
            {linked && !channelName && (
              <p className="text-sm text-muted-foreground">
                Aucune chaîne n&apos;a pu être lue sur ce compte.
              </p>
            )}
            {linked && channelUrl && (
              <a
                href={channelUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-muted-foreground underline underline-offset-2"
              >
                {channelUrl.replace(/^https:\/\//, "")}
              </a>
            )}
            {!oauthConfigured && (
              <p className="text-sm text-muted-foreground">
                Cette liaison n&apos;est pas configurée sur cet environnement.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {linked ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending}
                onClick={() => run(() => unlinkStreamAccount(platform), `Compte ${name} délié.`)}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Délier
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={!oauthConfigured}
                onClick={async () => {
                  await authClient.linkSocial({
                    provider: platform === "twitch" ? "twitch" : "google",
                    callbackURL: "/account/security",
                  });
                }}
              >
                Lier
              </Button>
            )}
          </div>
        </div>

        {linked && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium">Annonce automatique des directs</h3>
              <Badge variant={subscriptionState === "active" ? "default" : "secondary"}>
                {SUBSCRIPTION_LABELS[subscriptionState].label}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground">
              {listeningConfigured
                ? SUBSCRIPTION_LABELS[subscriptionState].hint
                : "L'annonce automatique n'est pas configurée sur cet environnement."}
            </p>

            {live && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/5 p-3">
                <Radio className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{live.title ?? "Direct en cours"}</span>
                <span className="text-sm text-muted-foreground">
                  depuis {DateTime.fromISO(live.startedAt).toRelative({ locale: "fr" })}
                </span>
              </div>
            )}

            <div className="space-y-2">
              {targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucune destination : vos directs ne sont annoncés nulle part.
                </p>
              ) : (
                targets.map(({ target, label }) => (
                  <div
                    key={`${target.kind}:${target.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{target.kind === "lair" ? "Lieu" : "Groupe"}</Badge>
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        run(() => removeStreamTarget(platform, target), `${label} ne sera plus annoncé.`)
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Retirer
                    </Button>
                  </div>
                ))
              )}
            </div>

            {available.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Select value={selected} onValueChange={setSelected}>
                  <SelectTrigger className="w-full sm:w-80">
                    <SelectValue placeholder="Ajouter un lieu ou un groupe…" />
                  </SelectTrigger>
                  <SelectContent>
                    {available.map(({ target, label }) => (
                      <SelectItem key={`${target.kind}:${target.id}`} value={`${target.kind}:${target.id}`}>
                        {target.kind === "lair" ? "Lieu" : "Groupe"} — {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={isPending || selected === ""}
                  onClick={() => {
                    const choice = available.find(
                      ({ target }) => `${target.kind}:${target.id}` === selected,
                    );

                    if (!choice) {
                      return;
                    }

                    run(
                      () => addStreamTarget(platform, choice.target),
                      `${choice.label} annoncera vos directs.`,
                    );
                  }}
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Ajouter
                </Button>
              </div>
            ) : (
              // Une liste vide a deux causes très différentes : ne rien avoir, ou
              // avoir déjà tout ajouté. Les confondre ferait chercher un lieu à
              // quelqu'un qui vient de l'inscrire.
              <p className="text-sm text-muted-foreground">
                {targets.length > 0
                  ? "Tous vos lieux et groupes annoncent déjà vos directs."
                  : "Vous n'avez ni lieu dont vous êtes propriétaire, ni groupe de jeu où annoncer un direct."}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
