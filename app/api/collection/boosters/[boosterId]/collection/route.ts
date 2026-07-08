import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { addBoosterToCollection, removeBoosterFromCollection, userOwnsBooster } from "@/lib/db/boosters";

export async function POST(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userOwnsBooster(session.user.id, boosterId))) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  try {
    const added = await addBoosterToCollection(session.user.id, boosterId);
    return NextResponse.json({ success: true, added });
  } catch (error) {
    console.error("Error adding booster to collection:", error);
    return NextResponse.json({ error: "Failed to add booster to collection" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userOwnsBooster(session.user.id, boosterId))) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  try {
    await removeBoosterFromCollection(session.user.id, boosterId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing booster from collection:", error);
    return NextResponse.json({ error: "Failed to remove booster from collection" }, { status: 500 });
  }
}
