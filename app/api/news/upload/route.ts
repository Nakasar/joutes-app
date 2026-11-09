import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasPermission } from "@/lib/db/permissions";
import { headers } from "next/headers";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { STILL_IMAGE_KINDS, readImageUpload } from "@/lib/media/image-upload";


export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const canUpload = await hasPermission("news:update");
    if (!canUpload) {
      return NextResponse.json({ error: "Permission refusée" }, { status: 403 });
    }

    const formData = await request.formData();
    const upload = await readImageUpload(formData, { kinds: STILL_IMAGE_KINDS, maxMegabytes: 5 });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

    const blob = await put(`news/banners/${Date.now()}-${readBlobFilename(file.name, "banner")}`, file, {
      access: "public",
    });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Erreur lors de l'upload de la bannière:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload de la bannière" },
      { status: 500 }
    );
  }
}
