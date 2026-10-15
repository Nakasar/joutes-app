import { getAchievementById } from "@/lib/db/achievements.ts";
import { AchievementForm } from "../../AchievementForm.tsx";
import { notFound } from "next/navigation";
import { AdminPage } from "../../../_components/AdminPage.tsx";

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
    <AdminPage
      title="Modifier le Succès"
      back={{ href: "/admin/achievements", label: "Succès" }}
      width="narrow"
    >
      <AchievementForm initialData={achievement} />
    </AdminPage>
  );
}

