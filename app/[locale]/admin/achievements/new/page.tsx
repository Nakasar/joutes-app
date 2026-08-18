import { AchievementForm } from "../AchievementForm";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function NewAchievementPage() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Nouveau Succès</h1>
      <AchievementForm />
    </div>
  );
}

