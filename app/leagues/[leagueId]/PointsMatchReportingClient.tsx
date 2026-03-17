"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { AlertCircle, CheckCircle, ChevronsUpDown, Loader2, MapPin, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { League, LeagueParticipant } from "@/lib/types/League";
import { reportPointsLeagueMatchAction, searchPlatformLairsAction } from "../actions";

type ParticipantWithUser = LeagueParticipant & {
  user?: {
    id: string;
    username: string;
    displayName?: string;
    discriminator?: string;
    avatar?: string;
  } | null;
};

type PointsMatchReportingClientProps = {
  leagueId: string;
  league: League;
  participantsWithUsers: ParticipantWithUser[];
};

function formatPlayerName(participant?: ParticipantWithUser | null) {
  if (!participant?.user) {
    return participant?.userId || "Joueur inconnu";
  }

  if (participant.user.displayName) {
    return participant.user.discriminator
      ? `${participant.user.displayName}#${participant.user.discriminator}`
      : participant.user.displayName;
  }

  return participant.user.username || participant.user.id;
}

export default function PointsMatchReportingClient({
  leagueId,
  league,
  participantsWithUsers,
}: PointsMatchReportingClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLairPopoverOpen, setIsLairPopoverOpen] = useState(false);
  const [lairQuery, setLairQuery] = useState("");
  const [platformLairs, setPlatformLairs] = useState<Array<{ id: string; name: string }>>([]);
  const [isSearchingLairs, setIsSearchingLairs] = useState(false);

  const hasPartnerLairs = league.lairs.length > 0;

  const [form, setForm] = useState({
    gameId: league.gameIds[0] || "",
    playedAt: DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm"),
    playerIds: [] as string[],
    winnerIds: [] as string[],
    lairId: "",
    freeLairName: "",
    notes: "",
  });

  const participantOptions = useMemo(
    () =>
      participantsWithUsers.map((participant) => ({
        value: participant.userId,
        label: formatPlayerName(participant),
        searchTerms: [participant.user?.username, participant.user?.displayName, participant.userId]
          .filter(Boolean)
          .join(" "),
      })),
    [participantsWithUsers]
  );

  const winnerOptions = useMemo(
    () => participantOptions.filter((option) => form.playerIds.includes(option.value)),
    [participantOptions, form.playerIds]
  );

  const partnerLairOptions = useMemo(
    () => league.lairs.map((lair) => ({ id: lair.id, name: lair.name })),
    [league.lairs]
  );

  const selectedLair = useMemo(() => {
    if (!form.lairId) {
      return null;
    }

    const fromPartners = partnerLairOptions.find((lair) => lair.id === form.lairId);
    if (fromPartners) {
      return fromPartners;
    }

    return platformLairs.find((lair) => lair.id === form.lairId) || null;
  }, [form.lairId, partnerLairOptions, platformLairs]);

  useEffect(() => {
    if (hasPartnerLairs) {
      return;
    }

    const trimmedQuery = lairQuery.trim();
    if (!trimmedQuery) {
      setPlatformLairs([]);
      return;
    }

    let isActive = true;
    const timeout = setTimeout(async () => {
      setIsSearchingLairs(true);
      const result = await searchPlatformLairsAction(trimmedQuery);
      if (!isActive) {
        return;
      }

      if (result.success) {
        setPlatformLairs(result.lairs || []);
      } else {
        setPlatformLairs([]);
      }

      setIsSearchingLairs(false);
    }, 250);

    return () => {
      isActive = false;
      clearTimeout(timeout);
    };
  }, [hasPartnerLairs, lairQuery]);

  const handleSubmit = () => {
    setError(null);
    setSuccess(null);

    if (!form.gameId) {
      setError("Veuillez selectionner un jeu");
      return;
    }

    if (form.playerIds.length < 2) {
      setError("Veuillez selectionner au moins 2 joueurs");
      return;
    }

    if (form.winnerIds.length === 0) {
      setError("Veuillez selectionner au moins un vainqueur");
      return;
    }

    if (hasPartnerLairs && !form.lairId) {
      setError("Le lieu est obligatoire pour cette ligue");
      return;
    }

    const playedAtDate = DateTime.fromISO(form.playedAt);
    if (!playedAtDate.isValid) {
      setError("Date du match invalide");
      return;
    }

    startTransition(async () => {
      const result = await reportPointsLeagueMatchAction(leagueId, {
        gameId: form.gameId,
        playedAt: playedAtDate.toISO() || form.playedAt,
        playerIds: form.playerIds,
        winnerIds: form.winnerIds,
        lairId: form.lairId || undefined,
        lairName: !form.lairId ? form.freeLairName.trim() || undefined : undefined,
        notes: form.notes.trim() || undefined,
      });

      if (result.success) {
        setSuccess("Match rapporte. Les confirmations ont ete envoyees.");
        setForm((previous) => ({
          ...previous,
          playedAt: DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm"),
          playerIds: [],
          winnerIds: [],
          lairId: "",
          freeLairName: "",
          notes: "",
        }));
        setLairQuery("");
        setPlatformLairs([]);
        setIsLairPopoverOpen(false);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors du rapport du match");
      }
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5" />
          Rapporter un match
        </CardTitle>
        <CardDescription>
          Les participants peuvent declarer un match. Chaque joueur du match recevra une notification de confirmation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Jeu</label>
          <Select
            value={form.gameId}
            onValueChange={(value) => setForm((previous) => ({ ...previous, gameId: value }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selectionner un jeu" />
            </SelectTrigger>
            <SelectContent>
              {league.games.map((game) => (
                <SelectItem key={game.id} value={game.id}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="points-match-played-at" className="text-sm font-medium">
            Date et heure du match
          </label>
          <Input
            id="points-match-played-at"
            type="datetime-local"
            value={form.playedAt}
            onChange={(event) =>
              setForm((previous) => ({
                ...previous,
                playedAt: event.target.value,
              }))
            }
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Joueurs du match</label>
          <MultiSelect
            options={participantOptions}
            selected={form.playerIds}
            onChange={(selectedPlayerIds) =>
              setForm((previous) => ({
                ...previous,
                playerIds: selectedPlayerIds,
                winnerIds: previous.winnerIds.filter((winnerId) =>
                  selectedPlayerIds.includes(winnerId)
                ),
              }))
            }
            placeholder="Selectionner les joueurs"
            searchPlaceholder="Rechercher un joueur"
            emptyMessage="Aucun joueur"
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Vainqueur(s)</label>
          <MultiSelect
            options={winnerOptions}
            selected={form.winnerIds}
            onChange={(winnerIds) =>
              setForm((previous) => ({
                ...previous,
                winnerIds,
              }))
            }
            placeholder="Selectionner le ou les vainqueurs"
            searchPlaceholder="Rechercher un joueur"
            emptyMessage="Aucun joueur selectionne"
            disabled={isPending || form.playerIds.length === 0}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Lieu {hasPartnerLairs ? <span className="text-red-500">*</span> : null}
          </label>

          <Popover open={isLairPopoverOpen} onOpenChange={setIsLairPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between" disabled={isPending}>
                <span className="truncate text-left">
                  {selectedLair?.name ||
                    (hasPartnerLairs
                      ? "Selectionner un lieu partenaire"
                      : "Selectionner un lieu de la plateforme")}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px] p-0">
              <Command shouldFilter={hasPartnerLairs}>
                <CommandInput
                  placeholder={
                    hasPartnerLairs
                      ? "Rechercher un lieu partenaire"
                      : "Rechercher un lieu"
                  }
                  value={lairQuery}
                  onValueChange={setLairQuery}
                />
                <CommandList>
                  <CommandEmpty>
                    {isSearchingLairs ? "Recherche en cours..." : "Aucun lieu trouve"}
                  </CommandEmpty>
                  <CommandGroup>
                    {(hasPartnerLairs ? partnerLairOptions : platformLairs).map((lair) => (
                      <CommandItem
                        key={lair.id}
                        value={hasPartnerLairs ? `${lair.name} ${lair.id}` : lair.id}
                        onSelect={() => {
                          setForm((previous) => ({
                            ...previous,
                            lairId: lair.id,
                            freeLairName: "",
                          }));
                          setIsLairPopoverOpen(false);
                        }}
                      >
                        <MapPin className="mr-2 h-4 w-4" />
                        {lair.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {!hasPartnerLairs && (
            <div className="space-y-2">
              <label htmlFor="points-free-lair-name" className="text-xs text-muted-foreground">
                Nom de lieu libre (optionnel)
              </label>
              <Input
                id="points-free-lair-name"
                placeholder="Ex: Soiree entre amis"
                value={form.freeLairName}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    freeLairName: event.target.value,
                    lairId: event.target.value ? "" : previous.lairId,
                  }))
                }
                disabled={isPending}
              />
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="points-match-notes" className="text-sm font-medium">
            Notes <span className="text-muted-foreground">(optionnel)</span>
          </label>
          <Input
            id="points-match-notes"
            value={form.notes}
            onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))}
            placeholder="Commentaire du match"
            disabled={isPending}
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={
            isPending ||
            !form.gameId ||
            form.playerIds.length < 2 ||
            form.winnerIds.length === 0 ||
            (hasPartnerLairs && !form.lairId)
          }
        >
          {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Envoyer le match
        </Button>

        <p className="text-xs text-muted-foreground">
          Les joueurs du match devront confirmer le resultat. {hasPartnerLairs ? "Le lieu devra aussi valider le match." : ""}
        </p>
      </CardContent>
    </Card>
  );
}
