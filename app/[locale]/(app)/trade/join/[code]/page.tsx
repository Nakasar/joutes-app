import { Suspense } from "react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getTradeByCode } from "@/lib/db/trades.ts";
import JoinTradeClient from "./JoinTradeClient.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trade");
  return {
    title: t("join.metadataTitle"),
    description: t("metadata.description"),
    robots: { index: false, follow: false },
  };
}

/**
 * Cible du QR code d'invitation. Le code fait office de droit d'accès : on
 * affiche qui invite, puis la jointure occupe la place libre de l'échange.
 */
async function JoinTradePageContent({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = code.trim().toUpperCase();

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    redirect(`/login?redirect=${encodeURIComponent(`/trade/join/${normalizedCode}`)}`);
  }

  const trade = await getTradeByCode(normalizedCode);
  if (!trade) {
    notFound();
  }

  // Déjà participant : on rejoint directement l'échange.
  if (trade.sides.some((side) => side.user?.id === session.user.id)) {
    redirect(`/trade/${trade.id}`);
  }

  const host = trade.sides.find((side) => side.user)?.user ?? null;
  const isFull = trade.sides.every((side) => !!side.user);

  return (
    <div className="mx-auto max-w-lg p-6 sm:p-8">
      <JoinTradeClient
        code={normalizedCode}
        host={host}
        status={trade.status}
        isFull={isFull}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function JoinTradePage(props: Parameters<typeof JoinTradePageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-lg p-6 sm:p-8">
          <AccountPanelSkeleton cards={2} label="Chargement de l’échange" />
        </div>
      }
    >
      <JoinTradePageContent {...props} />
    </Suspense>
  );
}
