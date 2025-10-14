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
    
    // Filtrer le lieu à supprimer
    const initialLength = storage.lairs.length;
    storage.lairs = storage.lairs.filter((lair) => lair.id !== id);
    
    if (storage.lairs.length === initialLength) {
      return NextResponse.json(
        { error: "Lieu non trouvé" },
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
