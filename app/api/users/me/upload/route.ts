import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { readBlobFilename } from "@/lib/media/blob-filename";
import { STILL_IMAGE_KINDS, readImageUpload } from "@/lib/media/image-upload";

/**
 * Le dépôt d'images d'un compte — son avatar, la bannière de sa vitrine.
 *
 * Une route à part de `/api/upload`, qui n'ouvre qu'aux administrateurs de
 * Joutes : ici c'est le titulaire qui dépose, et le droit se vérifie donc sur
 * **sa session**. Il n'y a pas de ressource à posséder, il est la ressource.
 *
 * Deux détails que l'action serveur qu'elle remplace n'avait pas, et qui
 * comptaient :
 *
 * - le nom du fichier est **réduit à son dernier segment et assaini**
 *   (`readBlobFilename`) : il vient du poste du déposant, et un nom porteur de
 *   séparateurs sortirait du préfixe du compte pour aller polluer celui d'un
 *   autre ;
 * - la clé est **préfixée par le compte** et porte un suffixe aléatoire.
 *   `put` jette sur un chemin déjà pris, si bien que deux personnes déposant
 *   chacune un `avatar.png` entraient en collision, et redéposer le même nom
 *   finissait en 500.
 */

/** Une bannière est large, un avatar est petit : deux bornes (en Mo), pas une. */
const MAX_MEGABYTES = {
  avatar: 2,
  banner: 5,
} as const;

type UploadKind = keyof typeof MAX_MEGABYTES;

function readKind(value: FormDataEntryValue | null): UploadKind {
  return value === "banner" ? "banner" : "avatar";
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth.api.getSession({ headers: request.headers });

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
    }

    const formData = await request.formData();
    const kind = readKind(formData.get("kind"));
    const upload = await readImageUpload(formData, { kinds: STILL_IMAGE_KINDS, maxMegabytes: MAX_MEGABYTES[kind] });
    if ("error" in upload) {
      return NextResponse.json({ error: upload.error }, { status: 400 });
    }
    const { file } = upload;

    const name = readBlobFilename(file.name, `${kind}.png`);

    const blob = await put(`users/${session.user.id}/${name}`, file, {
      access: "public",
      addRandomSuffix: true,
    });

    return NextResponse.json({ url: blob.url, pathname: blob.pathname });
  } catch (error) {
    console.error("Erreur lors de l'upload d'une image de compte:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du fichier" }, { status: 500 });
  }
}
