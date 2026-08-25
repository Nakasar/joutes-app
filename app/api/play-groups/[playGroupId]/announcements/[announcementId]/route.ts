import { NextRequest, NextResponse } from "next/server";

import { readPlayGroupViewer } from "@/lib/api/play-groups";
import {
  removePlayGroupAnnouncement,
  updatePlayGroupAnnouncement,
} from "@/lib/db/play-groups";
import { playGroupAnnouncementSchema } from "@/lib/schemas/play-group.schema";

type Params = Promise<{ playGroupId: string; announcementId: string }>;

/** Réécrit une annonce — fondateur et admins, comme sa publication. */
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, announcementId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId, { manage: true });
    if ("error" in gate) {
      return gate.error;
    }

    const exists = (gate.group.options?.announcements ?? []).some(
      (item) => item.id === announcementId,
    );
    if (!exists) {
      return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 });
    }

    const parsed = playGroupAnnouncementSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updated = await updatePlayGroupAnnouncement(
      playGroupId,
      announcementId,
      parsed.data,
    );

    return NextResponse.json({
      announcement:
        updated?.options?.announcements?.find((item) => item.id === announcementId) ?? null,
    });
  } catch (error) {
    console.error("Error updating a play group announcement:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  try {
    const { playGroupId, announcementId } = await params;
    const gate = await readPlayGroupViewer(request, playGroupId, { manage: true });
    if ("error" in gate) {
      return gate.error;
    }

    const exists = (gate.group.options?.announcements ?? []).some(
      (item) => item.id === announcementId,
    );
    if (!exists) {
      return NextResponse.json({ error: "Annonce introuvable" }, { status: 404 });
    }

    await removePlayGroupAnnouncement(playGroupId, announcementId);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Error deleting a play group announcement:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
