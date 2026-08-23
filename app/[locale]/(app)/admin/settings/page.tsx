import { connection } from "next/server";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { readAppSetting } from "@/lib/db/app-settings.ts";
import {
  DECK_IMAGE_MODEL_DEFAULT,
  DECK_IMAGE_MODEL_SETTING_KEY,
} from "@/lib/games/deck-image-model.ts";
import { DeckImageModelForm } from "./DeckImageModelForm.tsx";
import type { DeckImageModelState } from "./actions.ts";

export default async function AdminSettingsPage() {
  // Le pilote Mongo touche à l'horloge en chemin, ce qu'un prérendu ne sait
  // pas figer — même raison qu'ailleurs dans l'administration.
  await connection();

  const setting = await readAppSetting(DECK_IMAGE_MODEL_SETTING_KEY);

  const state: DeckImageModelState = setting
    ? {
        modelId: setting.value,
        isCustom: true,
        updatedAt: setting.updatedAt?.toISOString(),
        updatedBy: setting.updatedBy,
      }
    : { modelId: DECK_IMAGE_MODEL_DEFAULT, isCustom: false };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Réglages</h1>
        <p className="mt-1 text-muted-foreground">
          Ce qui se change sans redéploiement.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lecture d&apos;une liste de deck en photo</CardTitle>
          <CardDescription>
            Le modèle de vision qu&apos;emploie le vérificateur de deck quand on lui dépose
            une photo — les deux chemins, l&apos;envoi direct et le dépôt des fichiers
            lourds, s&apos;en servent. Relu à chaque analyse : un changement ici prend effet
            sur la lecture suivante, sans redéploiement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DeckImageModelForm
            initialState={state}
            defaultModelId={DECK_IMAGE_MODEL_DEFAULT}
          />
        </CardContent>
      </Card>
    </div>
  );
}
