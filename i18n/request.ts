import {getRequestConfig} from 'next-intl/server';
import {getUserLocale} from "@/i18n/locale";
import Negotiator from 'negotiator';
import {headers} from "next/headers";
import {match} from "@formatjs/intl-localematcher";
import {defaultLocale, locales} from "@/i18n/config";


export default getRequestConfig(async () => {
  let locale = await getUserLocale();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});