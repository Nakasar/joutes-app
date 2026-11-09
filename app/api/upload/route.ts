import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { admins } from "@/lib/config/admins";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { IMAGE_KINDS_WITH_GIF, readImageUpload } from "@/lib/media/image-upload";

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
    const upload = await readImageUpload(formData, { kinds: IMAGE_KINDS_WITH_GIF, maxMegabytes: 5 });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

    // Upload vers Vercel Blob
    const blob = await put(readBlobFilename(file.name, "image"), file, {
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
