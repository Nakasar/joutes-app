import { getAchievementById } from "@/lib/db/achievements";
import { AchievementForm } from "../../AchievementForm";
import { notFound } from "next/navigation";

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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Modifier le Succès</h1>
      <AchievementForm initialData={achievement} />
    </div>
  );
}

