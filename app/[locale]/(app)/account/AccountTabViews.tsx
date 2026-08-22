import { getTranslations } from "next-intl/server";
import {
  Coins,
  FileText,
  Gamepad2,
  GraduationCap,
  Mail,
  MapPin,
  Eye,
  Settings,
  Shield,
  User as UserIcon,
} from "lucide-react";

import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { getAllGames } from "@/lib/db/games.ts";
import { getLairsByIds } from "@/lib/db/lairs.ts";
import { getUserQuizScores } from "@/lib/db/quiz-scores.ts";
import type { User } from "@/lib/types/User";

import GamesManager from "./GamesManager.tsx";
import LairsManager from "./LairsManager.tsx";
import LocationDisplay from "./LocationDisplay.tsx";
import PricePreferenceManager from "./PricePreferenceManager.tsx";
import QuizScores from "./QuizScores.tsx";
import UsernameDisplay from "./UsernameDisplay.tsx";

/**
 * Le contenu des onglets « Profil » et « Jeux & lieux ».
 *
 * Les cartes sont celles d'avant, réparties en deux onglets plutôt qu'empilées
 * sur une seule page : c'est le seul changement. Les ancres `#jeux` et
 * `#prices` restent posées, l'une menant maintenant à son onglet et l'autre à
 * sa carte.
 */

function SectionCard({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  id?: string;
  icon: typeof UserIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-20 border-2 shadow-lg">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export async function ProfileTabView({ user }: { user: User }) {
  const [quizScores, t] = await Promise.all([
    getUserQuizScores(user.id),
    getTranslations("Account.profile"),
  ]);

  return (
    <div className="space-y-8">
      {/* L'avatar, la description, les liens et la visibilité vivent
          désormais dans « Ma vitrine » : ce sont les mêmes réglages, et les
          tenir à deux endroits laissait retirer d'un côté ce que l'autre
          réécrivait. */}
      <SectionCard
        icon={UserIcon}
        title={t("identity.title")}
        description={t("identity.description")}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/account?tab=showcase">
              <Eye className="mr-2 h-4 w-4" />
              {t("links.showcase")}
            </Link>
          </Button>
        }
      >
        <div className="space-y-6">
          <div className="border-b pb-6">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-4 w-4" />
              <span>{t("identity.email")}</span>
            </div>
            <p className="text-lg font-semibold">{user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("identity.emailLocked")}</p>
          </div>

          <div className="border-b py-4">
            <UsernameDisplay
              currentDisplayName={user.displayName}
              currentDiscriminator={user.discriminator}
            />
          </div>

          <div className="pt-4">
            <LocationDisplay
              currentLatitude={user.location?.latitude}
              currentLongitude={user.location?.longitude}
              currentLabel={user.location?.label}
              currentCity={user.location?.city}
              currentPostalCode={user.location?.postalCode}
            />
          </div>
        </div>
      </SectionCard>

      {/* L'ancre sert au raccourci « Choisir ma source de prix » de la fiche
          d'une carte. */}
      <SectionCard
        id="prices"
        icon={Coins}
        title={t("prices.title")}
        description={t("prices.description")}
      >
        <PricePreferenceManager initialPreference={user.pricePreference} />
      </SectionCard>

      <SectionCard
        icon={GraduationCap}
        title={t("quiz.title")}
        description={t("quiz.description")}
      >
        <QuizScores scores={quizScores} />
      </SectionCard>

      {/* Sécurité et Intégrations ne sont pas des onglets : on y va trois fois
          par an, et les y mettre allongerait la barre pour rien. */}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" size="sm" asChild>
          <Link href="/account/security">
            <Shield className="mr-2 h-4 w-4" />
            {t("links.security")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/account/integrations">
            <Settings className="mr-2 h-4 w-4" />
            {t("links.integrations")}
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/account/contents">
            <FileText className="mr-2 h-4 w-4" />
            {t("links.contents")}
          </Link>
        </Button>
      </div>
    </div>
  );
}

export async function GamesTabView({ user }: { user: User }) {
  const [allGames, userLairs, t] = await Promise.all([
    getAllGames(),
    getLairsByIds(user.lairs || []),
    getTranslations("Account.games"),
  ]);

  const userGames = (user.games || [])
    .map((gameId) => allGames.find((game) => game.id === gameId))
    .filter((game) => game !== undefined);

  return (
    <div className="space-y-8">
      {/* L'ancre `#jeux` d'avant les onglets mène maintenant à cet onglet, et le
          composant client `LegacyAnchorRedirect` s'occupe des liens partis dans
          la nature. */}
      <SectionCard
        id="jeux"
        icon={Gamepad2}
        title={t("games.title")}
        description={t("games.description")}
      >
        <GamesManager
          userGames={userGames}
          allGames={allGames}
          favoriteGameIds={user.favoriteGames ?? []}
        />
      </SectionCard>

      <SectionCard icon={MapPin} title={t("lairs.title")} description={t("lairs.description")}>
        <LairsManager userLairs={userLairs} />
      </SectionCard>
    </div>
  );
}
