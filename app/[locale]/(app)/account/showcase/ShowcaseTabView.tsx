import { getTranslations } from "next-intl/server";

import { plansForUserId } from "@/lib/subscriptions/access.ts";
import { displayPlan, grantsEntitlement } from "@/lib/subscriptions/entitlements.ts";
import { labelForPlan } from "@/lib/subscriptions/tone.ts";
import type { User } from "@/lib/types/User";
import { readUserLinks } from "@/lib/users/links.ts";
import { readUserShowcaseSections } from "@/lib/users/showcase.ts";

import ShowcaseForm from "./ShowcaseForm.tsx";

/**
 * L'onglet « Ma vitrine ».
 *
 * Il lit, il ne décide pas : l'ordre des blocs vient de
 * `readUserShowcaseSections`, qui complète ce qui manque, et les liens de
 * `readUserLinks`, qui fond les anciens champs `website` et `socialLinks[]`
 * avec les nouveaux. **C'est ce repli qui fait basculer un compte** : au
 * premier enregistrement, les trois sources deviennent la seule liste de la
 * vitrine, et les anciens champs cessent d'être écrits.
 */
export default async function ShowcaseTabView({ user }: { user: User }) {
  const [plans, t] = await Promise.all([
    plansForUserId(user.id),
    getTranslations("Account.showcase"),
  ]);

  const links = readUserLinks(user);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <ShowcaseForm
        canUseBanner={grantsEntitlement(plans, "sub:profile-banner")}
        planLabel={labelForPlan(displayPlan(plans))}
        initial={{
          isPublic: user.isPublicProfile === true,
          banner: user.showcase?.banner,
          avatar: user.profileImage || undefined,
          description: user.description ?? "",
          showCity: user.showcase?.showCity === true,
          city: user.location?.city,
          links: links.map((link) => ({ url: link.url, label: link.label })),
          sections: readUserShowcaseSections(user),
        }}
      />
    </div>
  );
}
