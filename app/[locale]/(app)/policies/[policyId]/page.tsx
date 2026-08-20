import { Suspense } from "react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPolicyById } from "@/lib/db/policies.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getLocale, getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards.ts";
import PolicyDetailView from "./PolicyDetailView.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { Locale } from "@/i18n/config.ts";

type Props = { params: Promise<{ policyId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { policyId } = await params;
  const policy = await getPolicyById(policyId);

  if (!policy) {
    return { title: "Policy introuvable" };
  }

  return {
    title: policy.title,
    description: policy.content.slice(0, 160),
    openGraph: {
      title: policy.title,
      description: policy.content.slice(0, 160),
    },
  };
}

async function PolicyDetailPageContent({ params }: Props) {
  const { policyId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  const policy = await getPolicyById(policyId, userId);
  if (!policy) {
    notFound();
  }

  const [userCanUpdatePolicies, userCanVotePolicies] = await Promise.all([
    hasPermission("policies:update"),
    hasPermission("policies:vote"),
  ]);

  const { cardIdByName, cardsById } = await resolveCardMentions(new ObjectId(policy.gameId), [
    policy.content,
    ...(policy.translations ?? []).map((tr) => tr.content),
  ]);

  const locale = await getLocale();
  const ruleLang = locale === "fr" ? "fr" : "en";
  const t = await getTranslations("Games");
  const gameSlug = policy.game?.slug ?? policy.gameId;

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <div className="mb-6">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/games/${gameSlug}/policies`}>
            ← {t("policies.detail.backToList", { gameName: policy.game?.name ?? "" })}
          </Link>
        </Button>
      </div>

      <PolicyDetailView
        policy={policy}
        gameSlug={gameSlug}
        ruleLang={ruleLang}
        cardIdByName={cardIdByName}
        cardsById={cardsById}
        interfaceLocale={locale as Locale}
        userCanUpdatePolicies={userCanUpdatePolicies}
        userCanVotePolicies={userCanVotePolicies}
      />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function PolicyDetailPage(props: Parameters<typeof PolicyDetailPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-6 max-w-3xl">
          <AccountPanelSkeleton cards={2} label="Chargement du ruling" />
        </div>
      }
    >
      <PolicyDetailPageContent {...props} />
    </Suspense>
  );
}
