"use server";

import {cookies, headers} from "next/headers";
import {Locale, defaultLocale, locales} from "@/i18n/config";
import Negotiator from "negotiator";
import {match} from "@formatjs/intl-localematcher";

// In this example the locale is read from a cookie. You could alternatively
// also read it from a database, backend service, or any other source.
const COOKIE_NAME = "NEXT_LOCALE";

export async function getUserLocale(): Promise<string> {
  const locale = (await cookies()).get(COOKIE_NAME)?.value;

  if (locale) {
    return locale;
  }

  const h = await headers();
  const acceptLanguages = h.get('accept-language');

  if (!acceptLanguages) {
    return defaultLocale;
  }

  const languages = new Negotiator({
    headers: {
      'accept-language': acceptLanguages,
    }
  }).languages()
  
  if (languages.length === 1 && languages[0] === "*") {
    return defaultLocale;
  }

  return match(languages, locales, defaultLocale);
}

export async function setUserLocale(locale: Locale) {
  (await cookies()).set(COOKIE_NAME, locale);
}