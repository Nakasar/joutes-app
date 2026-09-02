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
  /** Les champs de formulaire à envoyer, quand le site en attend — à adapter au lieu. */
  formFields?: Record<string, string>;
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

/**
 * Les Animations du Gobelin : une seule page pour toutes les villes, qu'un
 * formulaire filtre en POST (`animation=Thionville.lieu`). Chaque carte donne
 * le jeu à part, la date en toutes lettres sans année, une plage horaire, les
 * places restantes, le prix et la ville. Le préréglage vise Thionville : la
 * ville se change dans les champs de formulaire et dans le filtre de lieu.
 */
export const GOBELIN_PRESET: HtmlPreset = {
  key: "gobelin",
  label: "Animations du Gobelin",
  description: "Les cartes d'animations, filtrées par ville via le formulaire du site.",
  config: {
    itemSelector: "a.row-card-link",
    fields: {
      url: { attribute: "href" },
      title: { selector: "h5.card-title" },
      gameName: { selector: ".card-body .col.text-center > div" },
      date: { selector: "div.card-grid" },
      time: { selector: ".col.text-left > div:last-child" },
      status: { selector: ".col.text-left > div:first-child" },
      price: { selector: ".col.text-left > div:nth-child(2)" },
      venue: { selector: ".card-footer small" },
    },
    venue: "Thionville",
  },
  formFields: { animation: "Thionville.lieu" },
};

export const HTML_PRESETS: HtmlPreset[] = [OASIS_PRESET, GOBELIN_PRESET];
