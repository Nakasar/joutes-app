import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { readBlobFilename } from "@/lib/media/blob-filename";

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

const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/** Une bannière est large, un avatar est petit : deux bornes, pas une. */
const MAX_SIZE = {
  avatar: 2 * 1024 * 1024,
  banner: 5 * 1024 * 1024,
} as const;

type UploadKind = keyof typeof MAX_SIZE;

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
    const file = formData.get("file") as File | null;
    const kind = readKind(formData.get("kind"));

    if (!file) {
      return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Type de fichier non autorisé. Utilisez JPG, PNG ou WebP." },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE[kind]) {
      return NextResponse.json(
        {
          error: `Le fichier est trop volumineux (max ${MAX_SIZE[kind] / (1024 * 1024)} Mo)`,
        },
        { status: 400 },
      );
    }

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
