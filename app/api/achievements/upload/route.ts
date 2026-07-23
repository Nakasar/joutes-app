import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { checkAdmin } from "@/lib/middleware/admin";

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2 Mo

/**
 * Téléverse l'image (carrée) d'un succès vers Vercel Blob. Réservé aux
 * administrateurs. Renvoie l'URL publique à stocker sur le succès.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!(await checkAdmin())) {
      return NextResponse.json({ error: "Accès non autorisé" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Type de fichier non autorisé. Utilisez JPG, PNG ou WebP." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Le fichier est trop volumineux (max 2 Mo)" },
        { status: 400 }
      );
    }

    // Nom de fichier normalisé pour la clé Blob (évite espaces/unicode/« / »).
    const safeName =
      file.name
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "icone";
    const blob = await put(`achievements/icons/${Date.now()}-${safeName}`, file, {
      access: "public",
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Erreur lors de l'upload de l'icône de succès:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload de l'image" }, { status: 500 });
  }
}
