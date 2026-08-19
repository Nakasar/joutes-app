import { getAchievementById } from "@/lib/db/achievements.ts";
import { AchievementForm } from "../../AchievementForm.tsx";
import { notFound } from "next/navigation";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface EditAchievementPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function EditAchievementPage({ params }: EditAchievementPageProps) {
  const { id } = await params;
  const achievement = await getAchievementById(id);

  if (!achievement) {
    notFound();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Modifier le Succès</h1>
      <AchievementForm initialData={achievement} />
    </div>
  );
}

