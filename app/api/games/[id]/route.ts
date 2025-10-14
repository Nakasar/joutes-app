import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/middleware/admin";
import { storage } from "@/lib/storage";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin();
    const { id } = await params;
    
    // Filtrer le jeu à supprimer
    const initialLength = storage.games.length;
    storage.games = storage.games.filter((game) => game.id !== id);
    
    if (storage.games.length === initialLength) {
      return NextResponse.json(
        { error: "Jeu non trouvé" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Non autorisé" },
      { status: 401 }
    );
  }
}
