import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/db/permissions";
import { getAllGames } from "@/lib/db/games";
import { getAllTags } from "@/lib/db/news";
import { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import NewsForm from "../NewsForm";

export const metadata: Metadata = {
  title: "Rédiger une actualité",
  description: "Créer une nouvelle actualité",
};

export default async function CreateNewsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const canWrite = await hasPermission("news:update").catch(() => false);
  if (!canWrite) {
    redirect("/news");
  }

  const [games, existingTags] = await Promise.all([getAllGames(), getAllTags()]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link href="/news">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Retour aux actualités
          </Link>
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Rédiger une actualité</h1>
        <p className="text-muted-foreground mt-1">
          Créez une nouvelle actualité pour la communauté
        </p>
      </div>

      <NewsForm mode="create" games={games} existingTags={existingTags} />
    </div>
  );
}
