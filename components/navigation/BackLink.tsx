"use client";

import { useSyncExternalStore, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation.ts";
import { canGoBackInApp, subscribeInAppHistory } from "@/lib/navigation/in-app-history.ts";

type BackLinkProps = Omit<ComponentProps<typeof Link>, "href" | "children"> & {
  /** La page parente : la destination quand il n'y a pas de page de l'app où revenir. */
  href: string;
  /** Le libellé qui nomme cette page parente (« Retour aux lieux »). */
  label?: ReactNode;
  /** Ce qui précède le libellé : une flèche, le plus souvent. */
  children?: ReactNode;
};

/**
 * Un bouton « retour » qui ramène là d'où l'on vient.
 *
 * Arrivé depuis une autre page de l'app, il revient en arrière dans
 * l'historique : la page quittée revient telle quelle, recherche et filtres
 * compris (ils sont dans l'adresse), et le libellé devient un simple
 * « Retour », puisque la page précédente n'est pas forcément la parente.
 * Arrivé de l'extérieur, c'est un lien vers la page parente, avec son libellé.
 *
 * Le lien garde toujours son `href` : un clic du milieu ou « ouvrir dans un
 * nouvel onglet » mène à la page parente, comme avant.
 */
export function BackLink({ href, label, children, onClick, ...props }: BackLinkProps) {
  const t = useTranslations("Navigation");
  const router = useRouter();
  const canGoBack = useSyncExternalStore(subscribeInAppHistory, canGoBackInApp, () => false);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !canGoBackInApp()) return;
    // Clic modifié (nouvel onglet, fenêtre) : le lien fait son travail.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    router.back();
  };

  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
      {label !== undefined && (canGoBack ? t("back") : label)}
    </Link>
  );
}
