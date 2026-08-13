import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { listPushDevicesForUser, registerPushDevice } from "@/lib/db/push-devices";
import { enablePushForUser } from "@/lib/db/users-push";
import { registerPushDeviceSchema } from "@/lib/schemas/push-device.schema";
import { toPushDeviceSummary } from "@/lib/types/PushDevice";

/**
 * Les appareils enregistrés d'un utilisateur, et leur enregistrement.
 *
 * Le jeton complet ne sort jamais d'ici : c'est un secret d'envoi, et huit
 * caractères suffisent à reconnaître son téléphone dans une liste pour l'en
 * retirer.
 */

export async function GET(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await listPushDevicesForUser(auth.userId);
  return NextResponse.json({ devices: devices.map(toPushDeviceSummary) });
}

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = registerPushDeviceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Appareil invalide", details: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const device = await registerPushDevice({ userId: auth.userId, ...parsed.data });

    // Accepter l'invite du système **est** l'activation dans le compte. Sans
    // cela, l'utilisateur qui vient d'autoriser les notifications ne recevrait
    // rien tant qu'il n'a pas trouvé un second interrupteur sur le site, et
    // conclurait que la fonctionnalité est cassée. L'interrupteur, lui, reste
    // là pour couper.
    await enablePushForUser(auth.userId);

    return NextResponse.json({ device: toPushDeviceSummary(device) }, { status: 201 });
  } catch (error) {
    console.error("[push] enregistrement d'appareil impossible", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
