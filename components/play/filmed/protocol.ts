import type { EngineConfig, EngineView } from "@/lib/engine/types";
import type { Explanation, Found, Glance, Layout, Observation, Outcome, Point, ReferenceCard } from "@/lib/filmed/types";

/** Ce que la page demande au fil de lecture et de suivi (`filmed.worker.ts`). */
export type Spotted = { card: string; at: Point; angle: number };

export type FilmedRequest =
  /** Apprend les illustrations des cartes à reconnaître. */
  | { kind: "learn"; cards: ReferenceCard[] }
  /** Les bornes de largeur d'une carte dans l'image, après le calibrage. */
  | { kind: "card"; min: number; max: number }
  /** Lit une image entière, sans rien retenir. */
  | { kind: "read"; frame: ImageBitmap }
  /** L'image suivante : ne relit que ce qui a bougé puis s'est posé. */
  | { kind: "watch"; frame: ImageBitmap }
  | { kind: "forget" }
  | { kind: "start"; config: EngineConfig; battlefields: string[]; seed: number }
  | { kind: "observe"; spotted: Spotted[]; layout: Layout }
  | { kind: "choose"; index: number }
  | { kind: "repaired" }
  | { kind: "force"; spotted: Spotted[]; layout: Layout }
  | { kind: "points"; seat: number; points: number };

export type FilmedReply = {
  learned?: number;
  failed?: string[];
  found?: Found[];
  glance?: Glance;
  table?: EngineView | unknown;
  outcome?: Outcome;
  /** La table n'a pas changé depuis la dernière confrontation. */
  repeated?: boolean;
  observation?: Observation;
  explanation?: Explanation;
  notes?: string[];
};

export type FilmedProgress = { done: number; total: number };
