import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getOrCreateFriendCode } from "@/lib/db/users";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const code = await getOrCreateFriendCode(session.user.id);

    return NextResponse.json({ code });
  } catch (error) {
    console.error("Erreur lors de la récupération du code ami", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
