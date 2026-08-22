import type { UserShowcaseSection, UserShowcaseSectionKey } from "@/lib/users/showcase";

/**
 * Les onglets de la vitrine d'un profil.
 *
 * « Vitrine » empile tous les blocs activés ; les autres onglets n'en montrent
 * qu'un. La barre n'est donc pas une liste fixe : **un onglet dont le bloc est
 * éteint n'existe pas**, et un onglet dont le bloc n'a rien à montrer non plus.
 * Cette règle vit ici plutôt que dans le JSX pour qu'on puisse la vérifier sans
 * rendre une page.
 */

/** Les onglets, dans l'ordre de la barre. */
export const USER_PROFILE_TABS = [
  "showcase",
  "decks",
  "publications",
  "achievements",
  "trade",
] as const;

export type UserProfileTab = (typeof USER_PROFILE_TABS)[number];

/**
 * Le bloc qu'isole chaque onglet. « Vitrine » n'en isole aucun : elle les
 * empile tous.
 */
const TAB_SECTION: Record<Exclude<UserProfileTab, "showcase">, UserShowcaseSectionKey> = {
  decks: "decks",
  publications: "publications",
  achievements: "achievements",
  trade: "trade",
};

/** Ce que chaque bloc a réellement à montrer. */
export type ProfileSectionContent = Partial<Record<UserShowcaseSectionKey, boolean>>;

/**
 * Les onglets à rendre.
 *
 * `showcase` ouvre toujours la liste dès qu'un onglet la suit : seule, elle
 * n'empilerait rien qu'on ne voie déjà, et une barre à un seul onglet est du
 * décor. Un profil privé n'a pas de barre du tout — l'appelant ne demande alors
 * pas cette liste.
 */
export function visibleProfileTabs(
  sections: UserShowcaseSection[],
  content: ProfileSectionContent,
): UserProfileTab[] {
  const enabled = new Set(
    sections.filter((section) => section.enabled).map((section) => section.key),
  );

  const tabs = USER_PROFILE_TABS.filter((tab) => {
    if (tab === "showcase") {
      return true;
    }

    const key = TAB_SECTION[tab];
    return enabled.has(key) && content[key] === true;
  });

  return tabs.length > 1 ? tabs : [];
}

/**
 * L'onglet demandé par l'URL, ramené à ceux qui existent.
 *
 * Un onglet dont le bloc vient d'être éteint reste dans les marque-pages et les
 * liens partagés : il retombe sur « Vitrine » plutôt que sur une page vide.
 */
export function readUserProfileTab(
  value: string | undefined,
  visible: UserProfileTab[],
): UserProfileTab {
  return visible.includes(value as UserProfileTab) ? (value as UserProfileTab) : "showcase";
}

/** Les blocs à empiler pour cet onglet, dans l'ordre réglé par le compte. */
export function sectionsForTab(
  sections: UserShowcaseSection[],
  tab: UserProfileTab,
): UserShowcaseSectionKey[] {
  const enabled = sections.filter((section) => section.enabled).map((section) => section.key);

  if (tab === "showcase") {
    return enabled;
  }

  const key = TAB_SECTION[tab];
  return enabled.includes(key) ? [key] : [];
}
