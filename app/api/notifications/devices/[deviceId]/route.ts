import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { revokePushDevice } from "@/lib/db/push-devices";

/**
 * Retrait d'un appareil.
 *
 * C'est aussi ce que l'app appelle en se déconnectant — et elle doit le faire
 * **avant** de fermer sa session, sans quoi la requête part sans cookie,
 * répond 401, et le téléphone continue de recevoir les notifications du compte
 * qu'on vient de quitter.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { deviceId } = await params;
  const revoked = await revokePushDevice(auth.userId, deviceId);

  if (!revoked) {
    return NextResponse.json({ error: "Appareil introuvable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
