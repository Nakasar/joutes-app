import { checkAdmin } from "@/lib/middleware/admin.ts";
import { getAllAchievements } from "@/lib/db/achievements.ts";
import { getSubscriptionByUserId } from "@/lib/db/subscriptions.ts";
import type { Achievement } from "@/lib/types/Achievement";
import GrantPlanButton from "@/app/[locale]/(app)/users/GrantPlanButton.tsx";
import RevokeAchievementButton from "@/app/[locale]/(app)/users/RevokeAchievementButton.tsx";
import { UnlockAchievementButton } from "@/app/[locale]/(app)/users/UnlockAchievementButton.tsx";

import { readProfileAchievements, requireProfile } from "./profile-data.ts";

/**
 * Ce que l'équipe peut faire depuis un profil.
 *
 * Extrait tel quel de la page précédente : même comportement, même frontière.
 * Le catalogue complet des succès et l'abonnement brut ne sont lus que pour un
 * administrateur — les charger pour tout le monde ferait payer à chaque
 * visiteur deux requêtes qui ne lui montreront rien.
 */
export default async function ProfileAdminTools({ userTagOrId }: { userTagOrId: string }) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) {
    return null;
  }

  const [subject, { unlocked }] = await Promise.all([
    requireProfile(userTagOrId),
    readProfileAchievements(userTagOrId),
  ]);

  const [catalogue, subscription] = await Promise.all([
    getAllAchievements(),
    getSubscriptionByUserId(subject.user.id),
  ]);

  const unlockedIds = new Set(unlocked.map((achievement) => achievement.id));
  const availableToUnlock: Achievement[] = catalogue.filter(
    (achievement) => !unlockedIds.has(achievement.id),
  );

  return (
    <>
      <GrantPlanButton
        userId={subject.user.id}
        userTag={subject.tag}
        grantedPlans={subscription?.grantedPlans ?? []}
        paidPlans={subscription?.plans ?? []}
      />
      <UnlockAchievementButton
        userId={subject.user.id}
        userTag={subject.tag}
        availableAchievements={availableToUnlock}
      />
      <RevokeAchievementButton
        userId={subject.user.id}
        userTag={subject.tag}
        unlockedAchievements={unlocked}
      />
    </>
  );
}
