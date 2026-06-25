import { useLocale, useTranslations } from "next-intl";
import LocaleSwitcherSelect from "./locale-switcher-select";

export default function LocaleSwitcher() {
  const t = useTranslations("LocaleSwitcher");
  const locale = useLocale();

  return (
    <LocaleSwitcherSelect
      defaultValue={locale}
      items={[
        {
          value: "en",
          flag: '🇬🇧',
          label: t("en"),
        },
        {
          value: "fr",
          flag: '🇫🇷',
          label: t("fr"),
        },
        {
          value: "it",
          flag: '🇮🇹',
          label: t("it"),
        },
        {
          value: "de",
          flag: '🇩🇪',
          label: t("de"),
        },
      ]}
      label={t("label")}
    />
  );
}