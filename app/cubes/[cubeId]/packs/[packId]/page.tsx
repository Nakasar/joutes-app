import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCubeAccess, getCubeById, getCubePack, getCubePackCards, getCubePacks } from "@/lib/db/cubes";
import PackEditor from "./PackEditor";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function CubePackPage({
  params,
}: {
  params: Promise<{ cubeId: string; packId: string }>;
}) {
  const { cubeId, packId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  const t = await getTranslations("Cubes");

  const cube = await getCubeById(cubeId);
  if (!cube) {
    notFound();
  }

  const access = getCubeAccess(cube, session?.user?.id);
  if (!access.canView) {
    notFound();
  }

  const pack = await getCubePack(cubeId, packId);
  if (!pack) {
    notFound();
  }

  // Le rang du paquet sert de nom de repli : il se calcule sur la liste
  // complète, dans le même ordre que la page du cube.
  const packs = await getCubePacks(cubeId);
  const index = packs.findIndex((candidate) => candidate.id === packId);
  const packLabel = pack.name || t("packFallbackName", { index: index >= 0 ? index + 1 : 1 });

  const cards = await getCubePackCards(packId);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <PackEditor
        cube={cube}
        pack={pack}
        packLabel={packLabel}
        // L'éditeur n'affiche que l'identité des cartes : la date de création
        // reste côté serveur plutôt que de traverser sous deux formes.
        initialCards={cards.map(({ id, cardId, name, setCode, collectorNumber, image }) => ({
          id,
          cardId,
          name,
          setCode,
          collectorNumber,
          image,
        }))}
        canEdit={access.canEdit}
      />
    </div>
  );
}
