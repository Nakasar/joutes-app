"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type {
  TournamentFixedScoring,
  TournamentResultMode,
  TournamentSwissPairing,
  TournamentTiebreaker,
} from "@/lib/types/Tournament.ts";
import { scenariosFromText, scenariosToText } from "@/lib/tournaments/scenarios.ts";
import { updateGameTournamentDefaults } from "./actions.ts";
import type { GameTournamentDefaults } from "@/lib/tournaments/game-defaults.ts";

// Preset livré, tel que la page le transmet : ses libellés sont déjà traduits,
// le formulaire n'a plus qu'à les afficher.
export type PresetOption = {
  key: string;
  label: string;
  stats: { key: string; label: string }[];
  tiebreakers: TournamentTiebreaker[];
  defaults: {
    fixedScoring: TournamentFixedScoring;
    swissPairing: TournamentSwissPairing;
    bestOf: number;
    resultMode: TournamentResultMode;
    requireStats: boolean;
  };
};

// Valeurs sentinelles du sélecteur de preset : « suivre le jeu » et « aucune »
// ne sont pas des clés de preset, et doivent pourtant se choisir.
const INHERIT = "__inherit__";
const NONE = "__none__";

// Défauts de la plateforme, appliqués à un jeu sans preset. Recopiés ici plutôt
// qu'importés du domaine : ce formulaire ne parle que de ce qu'il affiche, et
// `resolveGameTournamentDefaults` reste seul juge à l'enregistrement.
const PLATFORM_DEFAULTS: PresetOption["defaults"] = {
  fixedScoring: { win: 3, loss: 0, draw: 1 },
  swissPairing: "ranked",
  bestOf: 1,
  resultMode: "selection",
  requireStats: false,
};

const SELECT_CLASS =
  "w-full px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

function sameScoring(a: TournamentFixedScoring, b: TournamentFixedScoring): boolean {
  return a.win === b.win && a.loss === b.loss && a.draw === b.draw;
}

/**
 * Réglages de tournoi par défaut d'un jeu.
 *
 * Un principe tient tout le formulaire : **on n'enregistre que ce qui s'écarte
 * du format livré**. Un barème laissé tel quel n'est pas recopié dans le
 * document, et le jeu continue donc de suivre son preset si les règles
 * officielles changent. C'est aussi ce qui permet de rendre un réglage au jeu
 * en le remettant à sa valeur d'origine, sans champ « hériter » par ligne.
 */
export function GameTournamentDefaultsForm({
  gameId,
  initial,
  presets,
  shippedPresetKey,
  genericTiebreakers,
}: {
  gameId: string;
  initial?: GameTournamentDefaults;
  presets: PresetOption[];
  // Preset que le catalogue applique d'office à ce jeu. Absent = aucun.
  shippedPresetKey?: string;
  genericTiebreakers: { key: TournamentTiebreaker; label: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [presetChoice, setPresetChoice] = useState<string>(
    initial?.statsPresetKey === null
      ? NONE
      : (initial?.statsPresetKey ?? INHERIT)
  );

  // Preset effectivement retenu par le choix courant.
  const effectivePresetKey = presetChoice === INHERIT ? shippedPresetKey : presetChoice === NONE ? undefined : presetChoice;
  const preset = presets.find((option) => option.key === effectivePresetKey);
  const presetDefaults = preset?.defaults ?? PLATFORM_DEFAULTS;

  // Critères calculables avec ce preset : ses statistiques, puis les critères
  // génériques. La plateforme ne sait rien départager d'autre.
  const available: { key: TournamentTiebreaker; label: string }[] = [
    ...(preset?.stats ?? []).map((stat) => ({
      key: `stat:${stat.key}` as TournamentTiebreaker,
      label: stat.label,
    })),
    ...genericTiebreakers,
  ];
  const labelOf = (key: TournamentTiebreaker): string =>
    available.find((candidate) => candidate.key === key)?.label ?? key;

  // Chaîne officielle du preset, filtrée de ce qu'il ne relève pas.
  const officialChain = (preset?.tiebreakers ?? genericTiebreakers.map((g) => g.key)).filter((key) =>
    available.some((candidate) => candidate.key === key)
  );

  // `null` = suivre les départages du preset ; un tableau = chaîne imposée
  // (vide comprise, qui veut dire « aucun départage »).
  const [tiebreakers, setTiebreakers] = useState<TournamentTiebreaker[] | null>(
    initial?.tiebreakers ?? null
  );
  const chain = tiebreakers ?? officialChain;

  const [scoring, setScoring] = useState<TournamentFixedScoring>(
    initial?.fixedScoring ?? presetDefaults.fixedScoring
  );
  const [swissPairing, setSwissPairing] = useState<TournamentSwissPairing>(
    initial?.swissPairing ?? presetDefaults.swissPairing
  );
  const [bestOf, setBestOf] = useState(String(initial?.bestOf ?? presetDefaults.bestOf));
  const [resultMode, setResultMode] = useState<TournamentResultMode>(
    initial?.resultMode ?? presetDefaults.resultMode
  );
  const [requireMatchStats, setRequireMatchStats] = useState(
    initial?.requireMatchStats ?? presetDefaults.requireStats
  );
  const [scenariosText, setScenariosText] = useState(scenariosToText(initial?.scenarios));

  // Changer de preset rebascule tout ce que le format livré décide : c'est ce
  // qu'on attend en choisissant un format, et chaque valeur reste modifiable
  // juste en dessous.
  const pickPreset = (choice: string) => {
    const next =
      choice === INHERIT ? shippedPresetKey : choice === NONE ? undefined : choice;
    const nextDefaults = presets.find((option) => option.key === next)?.defaults ?? PLATFORM_DEFAULTS;
    setPresetChoice(choice);
    setTiebreakers(null);
    setScoring(nextDefaults.fixedScoring);
    setSwissPairing(nextDefaults.swissPairing);
    setBestOf(String(nextDefaults.bestOf));
    setResultMode(nextDefaults.resultMode);
    setRequireMatchStats(nextDefaults.requireStats);
  };

  const moveTiebreaker = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= chain.length) return;
    const next = [...chain];
    [next[index], next[target]] = [next[target], next[index]];
    setTiebreakers(next);
  };

  const unused = available.filter((candidate) => !chain.includes(candidate.key));

  const submit = () => {
    setMessage(null);
    const parsedBestOf = Number.parseInt(bestOf, 10);
    const nextBestOf = Number.isFinite(parsedBestOf) && parsedBestOf >= 1 ? parsedBestOf : 1;
    const scenarios = scenariosFromText(scenariosText);

    const body: GameTournamentDefaults = {};
    if (presetChoice === NONE) body.statsPresetKey = null;
    else if (presetChoice !== INHERIT) body.statsPresetKey = presetChoice;
    if (tiebreakers !== null) body.tiebreakers = tiebreakers;
    if (!sameScoring(scoring, presetDefaults.fixedScoring)) body.fixedScoring = scoring;
    if (swissPairing !== presetDefaults.swissPairing) body.swissPairing = swissPairing;
    if (nextBestOf !== presetDefaults.bestOf) body.bestOf = nextBestOf;
    if (resultMode !== presetDefaults.resultMode) body.resultMode = resultMode;
    if (requireMatchStats !== presetDefaults.requireStats) body.requireMatchStats = requireMatchStats;
    if (scenarios.length > 0) body.scenarios = scenarios;

    startTransition(async () => {
      const result = await updateGameTournamentDefaults(gameId, body);
      setMessage(
        result.success
          ? { ok: true, text: "Réglages enregistrés." }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" }
      );
    });
  };

  return (
    <div className="space-y-6">
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

      {/* Statistiques relevées à chaque partie. Elles décident de ce qu'on peut
          départager : le bloc suivant n'a de choix à offrir que grâce à elles. */}
      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Statistiques de match</h2>
          <p className="text-sm text-muted-foreground">
            Relevées à chaque partie et utilisées pour départager le classement. Elles ne
            désignent jamais le vainqueur, et leurs clés sont livrées avec la plateforme.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1" htmlFor="preset">
            Format appliqué d&apos;office
          </label>
          <select
            id="preset"
            value={presetChoice}
            onChange={(e) => pickPreset(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value={INHERIT}>
              {shippedPresetKey
                ? `Format livré avec le jeu (${
                    presets.find((option) => option.key === shippedPresetKey)?.label ?? shippedPresetKey
                  })`
                : "Format livré avec le jeu (aucun)"}
            </option>
            <option value={NONE}>Aucune statistique</option>
            {presets.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {preset && (
          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={requireMatchStats}
              onChange={(e) => setRequireMatchStats(e.target.checked)}
            />
            <span>
              <span className="block text-sm font-medium text-foreground">Saisie obligatoire</span>
              <span className="block text-xs text-muted-foreground">
                Un résultat n&apos;est accepté que si toutes les statistiques sont renseignées,
                pour chaque joueur. Les raccourcis de score sont alors désactivés.
              </span>
            </span>
          </label>
        )}
      </section>

      {/* Départages, dans l'ordre. Même règle qu'au formulaire de phase : les
          points de match passent avant, et ne sont pas un critère. */}
      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Départage des égalités</h2>
            <p className="text-sm text-muted-foreground">
              Appliqués dans cet ordre, tant que deux joueurs restent à égalité.
            </p>
          </div>
          {tiebreakers === null ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setTiebreakers(officialChain)}>
              Personnaliser
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setTiebreakers(null)}>
              Suivre le format livré
            </Button>
          )}
        </div>

        <ol className="space-y-2">
          <li className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
            <span className="text-xs font-medium text-muted-foreground">1</span>
            <div>
              <div className="text-sm font-medium text-foreground">Points de match</div>
              <p className="text-xs text-muted-foreground">
                Le classement lui-même : victoires, nuls et défaites selon le barème. Toujours en
                premier.
              </p>
            </div>
          </li>
          {chain.map((key, index) => (
            <li key={key} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
              <span className="text-xs font-medium text-muted-foreground">{index + 2}</span>
              <div className="text-sm font-medium text-foreground">{labelOf(key)}</div>
              {tiebreakers !== null && (
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => moveTiebreaker(index, -1)}
                    aria-label={`Monter le critère ${labelOf(key)}`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === chain.length - 1}
                    onClick={() => moveTiebreaker(index, 1)}
                    aria-label={`Descendre le critère ${labelOf(key)}`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive/80"
                    onClick={() => setTiebreakers(chain.filter((k) => k !== key))}
                    aria-label={`Retirer le critère ${labelOf(key)}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>

        {chain.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Aucun départage : les joueurs à égalité de points le restent, dans un ordre
            arbitraire.
          </p>
        )}

        {tiebreakers !== null && unused.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Ajouter :</span>
            {unused.map((candidate) => (
              <Button
                key={candidate.key}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTiebreakers([...chain, candidate.key])}
              >
                <Plus className="mr-1 h-3 w-3" />
                {candidate.label}
              </Button>
            ))}
          </div>
        )}
      </section>

      {/* Format d'une phase : ce que le tunnel de création pré-remplit. */}
      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Format par défaut</h2>
          <p className="text-sm text-muted-foreground">
            Pré-rempli à la création d&apos;un tournoi et de ses phases.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="best-of">
              Parties par match (best-of-n)
            </label>
            <input
              id="best-of"
              type="number"
              min={1}
              max={9}
              value={bestOf}
              onChange={(e) => setBestOf(e.target.value)}
              className={SELECT_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="result-mode">
              Résultat des parties
            </label>
            <select
              id="result-mode"
              value={resultMode}
              onChange={(e) => setResultMode(e.target.value as TournamentResultMode)}
              className={SELECT_CLASS}
            >
              <option value="selection">Désignation du vainqueur</option>
              <option value="points">Saisie des points</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1" htmlFor="swiss">
              Appariement dans un même total de points
            </label>
            <select
              id="swiss"
              value={swissPairing}
              onChange={(e) => setSwissPairing(e.target.value as TournamentSwissPairing)}
              className={SELECT_CLASS}
            >
              <option value="ranked">Selon le classement</option>
              <option value="random-in-bracket">Tirage au sort dans le groupe</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <span className="block text-sm font-medium text-foreground mb-1">
              Barème (victoire / défaite / nul)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="Points de victoire"
                type="number"
                value={scoring.win}
                onChange={(e) => setScoring({ ...scoring, win: Number.parseInt(e.target.value, 10) || 0 })}
                className="w-24 px-4 py-2 border border-input rounded-lg bg-background"
              />
              <input
                aria-label="Points de défaite"
                type="number"
                value={scoring.loss}
                onChange={(e) => setScoring({ ...scoring, loss: Number.parseInt(e.target.value, 10) || 0 })}
                className="w-24 px-4 py-2 border border-input rounded-lg bg-background"
              />
              <input
                aria-label="Points de match nul"
                type="number"
                value={scoring.draw}
                onChange={(e) => setScoring({ ...scoring, draw: Number.parseInt(e.target.value, 10) || 0 })}
                className="w-24 px-4 py-2 border border-input rounded-lg bg-background"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Catalogue de scénarios. Le pool d'une phase reste libre : ce catalogue
          évite de retaper les missions officielles à chaque tournoi. */}
      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Scénarios disponibles</h2>
          <p className="text-sm text-muted-foreground">
            Un par ligne. Après le « | », les consignes affichées aux joueurs. Les organisateurs
            les retrouvent à la configuration d&apos;une phase et composent leur pool à partir de
            là.
          </p>
        </div>
        <textarea
          rows={8}
          value={scenariosText}
          onChange={(e) => setScenariosText(e.target.value)}
          placeholder={"Conflit mineur | Une seule escouade\nPriorité changeante | Deux escouades"}
          className="w-full px-4 py-2 border border-input rounded-lg bg-background font-mono text-sm focus:ring-2 focus:ring-ring focus:border-transparent"
        />
        <p className="text-xs text-muted-foreground">
          {scenariosFromText(scenariosText).length} scénario(s) au catalogue.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer les réglages"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Les tournois déjà créés ne sont pas modifiés : ces réglages ne servent qu&apos;aux
          nouvelles phases.
        </span>
      </div>
    </div>
  );
}
