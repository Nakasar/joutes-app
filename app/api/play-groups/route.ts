import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createPlayGroup, getPlayGroupsForUser } from "@/lib/db/play-groups";

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const groups = await getPlayGroupsForUser(session.user.id);
    return NextResponse.json({ groups });
  } catch (error) {
    console.error("Erreur lors de la récupération des groupes de jeu", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const description = typeof body?.description === "string" ? body.description.trim() : undefined;

    if (!name) {
      return NextResponse.json({ error: "Le nom du groupe est requis" }, { status: 400 });
    }

    const group = await createPlayGroup({
      name,
      description,
      ownerId: session.user.id,
    });

    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    console.error("Erreur lors de la création du groupe de jeu", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}