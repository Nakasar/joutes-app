import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getCubesForOwner, getPublicCubes } from "@/lib/db/cubes";
import { getAllGames } from "@/lib/db/games";
import CubesClient from "./CubesClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Cubes");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function CubesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [cubes, publicCubes, games] = await Promise.all([
    getCubesForOwner(session.user.id),
    getPublicCubes(),
    getAllGames(),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <CubesClient
        initialCubes={cubes}
        // Les cubes publics de l'utilisateur figurent déjà dans « mes cubes ».
        publicCubes={publicCubes.filter((cube) => cube.ownerId !== session.user.id)}
        games={games
          .filter((game): game is typeof game & { slug: string } => Boolean(game.slug))
          .map((game) => ({ id: game.id, name: game.name, slug: game.slug }))}
      />
    </div>
  );
}
