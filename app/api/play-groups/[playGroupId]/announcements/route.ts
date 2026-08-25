import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import {
  addPlayGroupAnnouncement,
  sortPlayGroupAnnouncements,
} from "@/lib/db/play-groups";
import { playGroupAnnouncementSchema } from "@/lib/schemas/play-group.schema";

type Params = Promise<{ playGroupId: string }>;

/**
 * Les annonces du groupe, de la plus récente à la plus ancienne.
 *
 * Réservé aux membres, **toutes portées confondues** : c'est le mur interne du
 * groupe. Les annonces de portée `public` reparaissent sur la vitrine, que
 * `GET /play-groups/{id}/showcase` sert sans session.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId);
    if ("error" in gate) {
      return gate.error;
    }

    return NextResponse.json({
      announcements: sortPlayGroupAnnouncements(gate.group.options?.announcements ?? []),
    });
  } catch (error) {
    console.error("Error listing play group announcements:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * Publie une annonce — fondateur et admins seulement.
 *
 * La portée décide de tout : `group` ne sort jamais de l'Établi, `public` est
 * reprise sur la vitrine. Il n'y a pas de troisième état — une annonce mal
 * cadrée se corrige en changeant sa portée.
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId, { manage: true });
    if ("error" in gate) {
      return gate.error;
    }

    const parsed = playGroupAnnouncementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error },
        { status: 400 },
      );
    }

    const announcement = {
      id: new ObjectId().toString(),
      title: parsed.data.title,
      body: parsed.data.body,
      scope: parsed.data.scope,
      authorId: gate.userId,
      publishedAt: new Date().toISOString(),
    };

    const updated = await addPlayGroupAnnouncement(playGroupId, announcement);
    if (!updated) {
      return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
    }

    return NextResponse.json({ announcement }, { status: 201 });
  } catch (error) {
    console.error("Error publishing a play group announcement:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
