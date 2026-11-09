/**
 * Le contrôle commun des images déposées par formulaire.
 *
 * Neuf routes de dépôt (avatar, bannière d'événement, logo de lieu, couverture
 * de deck ou de quiz, image de groupe, icône de succès, bannière d'actualité,
 * dépôt d'administration) refaisaient chacune les trois mêmes vérifications,
 * avec les mêmes messages. Elles vivent ici ; chaque route garde ce qui lui
 * est propre : qui a le droit de déposer, et sous quelle clé.
 *
 * Le type se vérifie **deux fois** : celui que le navigateur annonce, puis la
 * signature des premiers octets. Le premier est une chaîne écrite par le
 * client — un envoi fabriqué à la main annonce `image/png` sur n'importe quel
 * contenu, que le stockage resservirait ensuite sous notre nom.
 */

export type ImageKind = "jpeg" | "png" | "webp" | "gif";

const MIME_TYPES: Record<ImageKind, string[]> = {
  jpeg: ["image/jpeg", "image/jpg"],
  png: ["image/png"],
  webp: ["image/webp"],
  gif: ["image/gif"],
};

/** Les formats d'une photo ou d'une illustration fixe. */
export const STILL_IMAGE_KINDS: ImageKind[] = ["jpeg", "png", "webp"];

/** Les mêmes, plus le GIF, pour les couvertures qui peuvent être animées. */
export const IMAGE_KINDS_WITH_GIF: ImageKind[] = [...STILL_IMAGE_KINDS, "gif"];

const MEGABYTE = 1024 * 1024;

/** Le format que disent les premiers octets, ou `null` s'ils ne disent rien. */
export function sniffImageKind(bytes: Uint8Array): ImageKind | null {
  const startsWith = (signature: number[], offset = 0) =>
    bytes.length >= offset + signature.length &&
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // « GIF87a » ou « GIF89a ».
  if (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) return "gif";
  // « RIFF », quatre octets de taille, puis « WEBP ».
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return "webp";

  return null;
}

function describeKinds(kinds: ImageKind[]): string {
  const names = kinds.map((kind) => ({ jpeg: "JPG", png: "PNG", webp: "WebP", gif: "GIF" })[kind]);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} ou ${names[names.length - 1]}` : names[0];
}

export type ImageUpload = { file: File } | { error: string };

/**
 * Lit le fichier du champ `file` et le vérifie. Rend le fichier, ou le message
 * à renvoyer en 400 :
 *
 *     const upload = await readImageUpload(formData, { kinds: STILL_IMAGE_KINDS, maxMegabytes: 5 });
 *     if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: 400 });
 */
export async function readImageUpload(
  formData: FormData,
  options: { kinds: ImageKind[]; maxMegabytes: number; field?: string },
): Promise<ImageUpload> {
  const file = formData.get(options.field ?? "file");

  if (!(file instanceof File)) {
    return { error: "Aucun fichier fourni" };
  }

  const wrongType = { error: `Type de fichier non autorisé. Utilisez ${describeKinds(options.kinds)}.` };

  if (!options.kinds.some((kind) => MIME_TYPES[kind].includes(file.type))) {
    return wrongType;
  }

  if (file.size > options.maxMegabytes * MEGABYTE) {
    return { error: `Le fichier est trop volumineux (max ${options.maxMegabytes} Mo)` };
  }

  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const sniffed = sniffImageKind(head);

  if (!sniffed || !options.kinds.includes(sniffed)) {
    return wrongType;
  }

  return { file };
}
