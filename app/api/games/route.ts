import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin";
import { Game } from "@/lib/types/Game";
import { storage } from "@/lib/storage";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    return NextResponse.json(storage.games);
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
    
    const newGame: Game = {
      id: crypto.randomUUID(),
      name: body.name,
      icon: body.icon,
      banner: body.banner,
      description: body.description,
      type: body.type,
    };

    storage.games.push(newGame);
    
    return NextResponse.json(newGame, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }
}
