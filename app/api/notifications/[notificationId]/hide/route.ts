import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { hideNotification } from "@/lib/db/notifications";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await params;

  try {
    await hideNotification(notificationId, auth.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notifications] masquage impossible", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
