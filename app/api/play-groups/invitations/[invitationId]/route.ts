import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { acceptPlayGroupInvitation } from "@/lib/db/play-groups";

export async function POST(request: NextRequest, { params }: { params: Promise<{ invitationId: string }> }) {
  try {
    const { invitationId } = await params;
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const group = await acceptPlayGroupInvitation(invitationId, session.user.id);

    if (!group) {
      return NextResponse.json({ error: "Invitation introuvable" }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch (error) {
    console.error("Erreur lors de l'acceptation de l'invitation", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

