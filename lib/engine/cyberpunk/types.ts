/**
 * Ce que le moteur de Cyberpunk TCG échange avec la table, tel qu'il l'écrit
 * en JSON (dépôt joutes-engine, crate `joutes-cyberpunk`).
 */

import type { BotLevel } from "@/lib/engine/types";

export type CpKind = "unit" | "program" | "legend" | "gear";

export type CpColor = "red" | "blue" | "green" | "yellow";

/** Une carte du catalogue du moteur (`cp_catalog`). */
export type CpEngineCard = {
  id: number;
  code: string;
  name: string;
  subtitle?: string | null;
  kind: CpKind;
  color: CpColor;
  cost: number | null;
  power: number | null;
  ram: number;
  /** La carte porte le Sell Tag : elle peut être vendue pour une Eddie. */
  sell: boolean;
  tags: string[];
  rarity?: string;
  text?: string;
  coverage: "full" | "none" | { partial: string };
};

/** Un deck construit : trois Légendes et le reste (codes du moteur, « WNC-001 »). */
export type CpDeckList = { legends: string[]; cards: string[] };

export type CpConfig = { players: { name: string; deck: CpDeckList }[] };

export type CpDie = "d4" | "d6" | "d8" | "d10" | "d12" | "d20";

export type CpAction =
  | { type: "roll"; gig: number }
  | { type: "sell"; card: number }
  | { type: "call"; legend: number }
  | { type: "play"; card: number; on?: number }
  | { type: "go_solo"; legend: number }
  | { type: "activate"; source: number; ability: number }
  | { type: "attack"; attacker: number; target?: number }
  | { type: "block"; unit: number }
  | { type: "pick"; obj: number }
  | { type: "pick_gig"; gig: number }
  | { type: "number"; n: number }
  | { type: "option"; index: number }
  | { type: "pay"; source: number }
  | {
      type: "go_first" | "go_second" | "mulligan" | "keep" | "end_react" | "pass" | "yes" | "no" | "done" | "concede";
    };

export type CpRecord = { version?: number; config: CpConfig; seed: number; actions: unknown[] };

/** `code` et `name` absents : une carte que ce joueur ne voit pas. `cost` : pour la main seulement. */
export type CpCardRef = { id: number; code: string | null; name: string | null; cost?: number };

export type CpGear = { id: number; code: string; name: string };

export type CpKeyword = "adrenaline" | "blocker" | "go_solo";

export type CpUnit = {
  id: number;
  code: string;
  name: string;
  owner: number;
  controller: number;
  spent: boolean;
  power: number;
  /** Arrivée ce tour : elle ne peut pas encore attaquer (règle 11.3). */
  lag: boolean;
  /** Une Légende jouée en Go Solo. */
  solo: boolean;
  keywords: CpKeyword[];
  gears: CpGear[];
};

export type CpLegend = {
  id: number;
  face_up: boolean;
  spent: boolean;
  /** Face visible, ou face cachée pour qui l'a regardée. */
  code: string | null;
  name: string | null;
  /** Ce joueur l'a regardée alors qu'elle est face cachée. */
  peeked: boolean;
  gears: CpGear[];
};

export type CpGig = {
  id: number;
  die: CpDie;
  owner: number;
  controller: number;
  value: number;
  /** Encore dans la zone du fixer (pas encore lancé). */
  in_fixer: boolean;
};

export type CpPlayer = {
  seat: number;
  name: string;
  /** `null` pour Null : aucun Gig (règle 5.11.4). */
  street_cred: number | null;
  gigs: number;
  legends: CpLegend[];
  legend_list: string[] | null;
  hand_count: number;
  /** `null` pour une main qu'on ne voit pas. */
  hand: CpCardRef[] | null;
  deck_count: number;
  trash: CpCardRef[];
  removed: CpCardRef[];
  eddies: number;
  eddies_ready: number;
  /** Il a déjà vendu une carte ce tour (règle 8.11.1). */
  sold: boolean;
  /** Il a déjà appelé une Légende ce tour (règle 8.12). */
  called: boolean;
};

export type CpDecisionKind =
  | "first_player"
  | "mulligan"
  | "roll_in"
  | "main"
  | "react"
  | "target"
  | "card"
  | "legend"
  | "gig"
  | "gig_value"
  | "may"
  | "mode"
  | "trigger_order"
  | "pay";

/** `card` : la carte que le choix désigne, pour montrer une carte qui n'est pas en jeu. */
export type CpChoice = { action: CpAction; label: string; card?: string | null };

export type CpPrompt = { kind: CpDecisionKind; text: string; card?: string | null; choices: CpChoice[] };

export type CpResult = { winners: number[]; reason?: string } | Record<string, unknown>;

export type CpView = {
  viewer: unknown;
  turn: number;
  phase: "setup" | "start" | "main" | "end" | "over";
  active: number;
  first: number;
  /** La prolongation a commencé (règle 1.11). */
  overtime: boolean;
  players: CpPlayer[];
  field: CpUnit[];
  gigs: CpGig[];
  /** L'attaque en cours : attaquant et Unité défenseuse (`null` pour une attaque des Gigs). */
  attack: [number, number | null] | null;
  to_act: number | null;
  decision?: unknown;
  result: CpResult | null;
};

export type CpEvent = { type: string; [key: string]: unknown };

export type CpTold = { event: CpEvent; text: string | null; rule?: string | null };

export type CpUpdate = { seq: number; view: CpView; events: CpTold[]; prompt: CpPrompt | null };

export type { BotLevel };
