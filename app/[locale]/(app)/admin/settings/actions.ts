'use server';

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

import { requireAdmin } from "@/lib/middleware/admin.ts";
import { clearAppSetting, writeAppSetting } from "@/lib/db/app-settings.ts";
import {
  DECK_IMAGE_MODEL_DEFAULT,
  DECK_IMAGE_MODEL_SETTING_KEY,
} from "@/lib/games/deck-image-model.ts";
import { isValidModelId, MODEL_ID_MAX_LENGTH } from "@/lib/models/model-id.ts";

export type DeckImageModelState = {
  modelId: string;
  /** `false` quand la valeur vient du code et non de la base. */
  isCustom: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export type SaveResult =
  | { ok: true; state: DeckImageModelState }
  | { ok: false; error: string };

export type TestResult =
  | { ok: true; reply: string }
  | { ok: false; error: string };

/**
 * Un damier 16×16, 94 octets, encodé ici plutôt que déposé quelque part : la
 * sonde doit passer par le même chemin qu'une photo de liste — texte plus
 * image — pour qu'un modèle sans vision échoue au test au lieu d'attendre la
 * première vraie liste pour le faire.
 */
const PROBE_IMAGE =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJUlEQVR4nGP4jwQYkAAucZwSA6hhkDuPKA2DxBkUaRjkziNGAwDZV36QRoblpQAAAABJRU5ErkJggg==';

function rejectInvalid(modelId: string): string | null {
  if (!modelId) {
    return "Indiquez un identifiant de modèle.";
  }

  if (modelId.length > MODEL_ID_MAX_LENGTH) {
    return `L'identifiant dépasse ${MODEL_ID_MAX_LENGTH} caractères.`;
  }

  if (!isValidModelId(modelId)) {
    return "L'identifiant ne peut contenir que des lettres, chiffres, points, tirets, soulignés, deux-points et barres obliques.";
  }

  return null;
}

export async function saveDeckImageModelAction(rawModelId: string): Promise<SaveResult> {
  const session = await requireAdmin();

  const modelId = rawModelId.trim();
  const invalid = rejectInvalid(modelId);
  if (invalid) {
    return { ok: false, error: invalid };
  }

  const updatedBy = session.user.email;
  await writeAppSetting(DECK_IMAGE_MODEL_SETTING_KEY, modelId, updatedBy);

  return {
    ok: true,
    state: {
      modelId,
      isCustom: true,
      updatedAt: new Date().toISOString(),
      updatedBy,
    },
  };
}

/** Efface le réglage : la lecture suivante retombe sur le modèle du code. */
export async function resetDeckImageModelAction(): Promise<SaveResult> {
  await requireAdmin();

  await clearAppSetting(DECK_IMAGE_MODEL_SETTING_KEY);

  return {
    ok: true,
    state: { modelId: DECK_IMAGE_MODEL_DEFAULT, isCustom: false },
  };
}

/**
 * Un appel réel, sur l'identifiant saisi — pas sur celui enregistré : c'est
 * ainsi qu'on essaie un modèle avant de le retenir. Rien n'est écrit.
 */
export async function testDeckImageModelAction(rawModelId: string): Promise<TestResult> {
  await requireAdmin();

  const modelId = rawModelId.trim();
  const invalid = rejectInvalid(modelId);
  if (invalid) {
    return { ok: false, error: invalid };
  }

  try {
    const { text } = await generateText({
      model: openai(modelId),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Décris cette image en trois mots au maximum.",
            },
            {
              type: "image",
              image: PROBE_IMAGE,
            },
          ],
        },
      ],
    });

    const reply = text.trim();

    if (!reply) {
      return { ok: false, error: "Le modèle a répondu, mais sans rien dire." };
    }

    return { ok: true, reply: reply.slice(0, 300) };
  } catch (error) {
    console.error("Échec du test du modèle de lecture de liste", error);

    return {
      ok: false,
      error: error instanceof Error ? error.message : "L'appel au modèle a échoué.",
    };
  }
}
