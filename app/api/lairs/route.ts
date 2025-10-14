import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin";
import { Lair } from "@/lib/types/Lair";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    return NextResponse.json(storage.lairs);
  } catch (error) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    
    const newLair: Lair = {
      id: crypto.randomUUID(),
      name: body.name,
      banner: body.banner,
      games: body.games || [],
      owners: [], // À compléter avec l'authentification
    };

    storage.lairs.push(newLair);
    
    return NextResponse.json(newLair, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }
}
