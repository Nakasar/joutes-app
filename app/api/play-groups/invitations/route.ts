import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPendingInvitationsForUser } from "@/lib/db/play-groups";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const invitations = await getPendingInvitationsForUser(session.user.id);
    return NextResponse.json({ invitations });
  } catch (error) {
    console.error("Erreur lors de la récupération des invitations", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

