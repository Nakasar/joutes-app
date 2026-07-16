import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getPolicyById } from "@/lib/db/policies";
import { hasPermission } from "@/lib/db/permissions";
import { getLocale, getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { ObjectId } from "mongodb";
import { resolveCardMentions } from "@/lib/game-content-cards";
import PolicyDetailView from "./PolicyDetailView";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Locale } from "@/i18n/config";

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

export default async function PolicyDetailPage({ params }: Props) {
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
