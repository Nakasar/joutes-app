import type { EventHtmlConfig } from "@/lib/types/Lair";

/**
 * Des configurations HTML toutes faites pour les plateformes de boutique
 * qu'on rencontre chez les lieux. Le formulaire les propose en un clic ;
 * elles restent modifiables ensuite, champ par champ.
 */
export type HtmlPreset = {
  key: string;
  label: string;
  description: string;
  config: EventHtmlConfig;
};

/**
 * Oasis, la plateforme de boutique de l'Antre Temps et d'autres boutiques de
 * jeux françaises : les événements y sont des produits, dans une grille dont
 * chaque case porte l'identifiant produit, un titre composé « Jeu - Nom -
 * JJ/MM/AAAA - HHhMM », le stock et le prix.
 */
export const OASIS_PRESET: HtmlPreset = {
  key: "oasis",
  label: "Boutique Oasis",
  description: "Les événements vendus comme des produits, dans une grille « product_box ».",
  config: {
    itemSelector: ".product_box",
    fields: {
      id: { selector: ".bp_content", attribute: "idProduit" },
      title: { selector: ".bp_designation a" },
      url: { selector: ".bp_designation a", attribute: "href" },
      price: { selector: ".bp_prix" },
      status: { selector: ".bp_stock" },
    },
    titleSeparator: " - ",
  },
};

export const HTML_PRESETS: HtmlPreset[] = [OASIS_PRESET];
