import { AchievementForm } from "../AchievementForm.tsx";
import { AdminPage } from "../../_components/AdminPage.tsx";

export default function NewAchievementPage() {
  return (
    <AdminPage
      title="Nouveau Succès"
      back={{ href: "/admin/achievements", label: "Succès" }}
      width="narrow"
    >
      <AchievementForm />
    </AdminPage>
  );
}

