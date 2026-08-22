"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";

import { usePathname, useRouter } from "@/i18n/navigation.ts";

/**
 * La recherche du registre.
 *
 * L'état vit dans l'URL, pas dans le composant : un registre filtré se partage,
 * se recharge, et revient intact par le bouton « précédent ». Le champ garde
 * une copie locale pour rester réactif sous les doigts, et pousse dans l'URL
 * après une pause — pousser à chaque touche relancerait une requête serveur par
 * caractère.
 */
export default function RegistrySearchField({ value: initial }: { value: string }) {
  const t = useTranslations("Users.registry.search");
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initial);
  const pushed = useRef(initial);

  useEffect(() => {
    if (value === pushed.current) {
      return;
    }

    const timer = setTimeout(() => {
      pushed.current = value;

      const params = new URLSearchParams(window.location.search);
      if (value.trim()) {
        params.set("q", value.trim());
      } else {
        params.delete("q");
      }
      // Une recherche nouvelle repart de la première page : garder le compteur
      // ferait afficher soixante fiches d'un coup pour un mot qu'on vient de
      // taper.
      params.delete("count");

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, 300);

    return () => clearTimeout(timer);
  }, [value, pathname, router]);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={t("placeholder")}
        aria-label={t("label")}
        className="h-11 w-full rounded-[10px] border bg-card pr-10 pl-10 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label={t("clear")}
          className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
