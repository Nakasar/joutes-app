import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { admins } from "@/lib/config/admins";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Vérifier que l'utilisateur est un admin
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session || !admins.includes(session.user.email)) {
      return NextResponse.json(
        { error: "Non autorisé" },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json(
        { error: "Aucun fichier fourni" },
        { status: 400 }
      );
    }

    // Vérifier le type de fichier
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "Type de fichier non autorisé. Utilisez JPG, PNG, WebP ou GIF." },
        { status: 400 }
      );
    }

    // Limiter la taille du fichier à 5 MB
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "Le fichier est trop volumineux (max 5 MB)" },
        { status: 400 }
      );
    }

    // Upload vers Vercel Blob
    const blob = await put(file.name, file, {
      access: "public",
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
    });
  } catch (error) {
    console.error("Erreur lors de l'upload:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload du fichier" },
      { status: 500 }
    );
  }
}
