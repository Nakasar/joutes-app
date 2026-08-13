import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api/authenticate";
import { markAllNotificationsAsRead } from "@/lib/db/notifications";

export async function POST(request: Request) {
  const auth = await authenticateApiRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await markAllNotificationsAsRead(auth.userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[notifications] marquage global impossible", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
