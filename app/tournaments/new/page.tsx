import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getAllGames } from "@/lib/db/games";
import { NewTournamentForm } from "./NewTournamentForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tournaments");
  return {
    title: t("new.title"),
  };
}

export default async function NewTournamentPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const t = await getTranslations("Tournaments");
  const locale = await getLocale();

  const games = (await getAllGames())
    .map((game) => ({ id: game.id, name: game.name }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">{t("new.title")}</h1>
      <NewTournamentForm games={games} />
    </div>
  );
}
