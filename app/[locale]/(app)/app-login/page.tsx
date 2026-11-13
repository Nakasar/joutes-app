import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { auth } from "@/lib/auth.ts";
import { APP_LOGIN_CODE_TTL_MINUTES, formatAppLoginCode } from "@/lib/users/app-login-code.ts";
import { AppLoginCode } from "./AppLoginCode.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("AppLogin");
  return { title: `Joutes - ${t("title")}`, robots: { index: false, follow: false } };
}

/**
 * Connexion de l'app mobile avec un compte du site (Discord surtout, que
 * l'app ne sait pas ouvrir elle-même).
 *
 * L'app ouvre cette page dans le navigateur du téléphone. Sans session, on
 * passe par la page de connexion, qui revient ici. Avec une session, la page
 * affiche un code à usage unique de quelques minutes, que le joueur recopie
 * dans l'app : celle-ci l'échange contre la même session
 * (`/api/auth/one-time-token/verify`). Chaque affichage en tire un nouveau.
 */
async function AppLoginContent() {
  await connection();
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/app-login");
  }

  const t = await getTranslations("AppLogin");
  const { token } = await auth.api.generateOneTimeToken({ headers: requestHeaders });

  return (
    <div className="container mx-auto flex max-w-md flex-col gap-6 p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">
          {t("intro", { name: session.user.name || session.user.email || "" })}
        </p>
      </div>
      <AppLoginCode code={formatAppLoginCode(token)} />
      <p className="text-sm text-muted-foreground">
        {t("expires", { minutes: APP_LOGIN_CODE_TTL_MINUTES })}
      </p>
      <p className="text-xs text-muted-foreground">{t("warning")}</p>
    </div>
  );
}

export default function AppLoginPage() {
  return (
    <Suspense fallback={<div className="container mx-auto max-w-md p-6" />}>
      <AppLoginContent />
    </Suspense>
  );
}
