/*
  Les composants partagés avec le site lisent leurs textes par `next-intl`, qui
  suppose le routeur de Next.js. Hors de Next, dans une vue MCP App, on les
  branche sur `use-intl`, la bibliothèque sur laquelle `next-intl` est bâti :
  mêmes fonctions, même format de messages. scripts/build-mcp-apps.mjs
  substitue ce fichier à `next-intl` à l'empaquetage.
*/
export {useFormatter, useLocale, useNow, useTimeZone, useTranslations} from "use-intl";
