import {Button} from "@/components/ui/button.tsx";
import {readGameBySlugOrId} from "@/lib/db/games-cached.ts";
import { Link } from "@/i18n/navigation.ts";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar.tsx";

/**
 * Bloquée par le layout racine, pas par cette page.
 *
 * La page elle-même ne lit plus rien qui empêche le prérendu : la lecture du
 * jeu est en cache, la langue est fixée. Ce qui bloque est en amont — le
 * `await params` du layout racine, qui rend indispensable la coquille de repli
 * de toute route à segment dynamique. Voir le document d'adoption, « Le verrou
 * du layout racine ».
 *
 * Mesuré : en neutralisant cette lecture dans le layout, cette page construit
 * en `○` sur les 28 chemins concrets. L'opt-out saute avec le verrou, pas
 * avant.
 */
export const instant = false;

export default async function GameRulesPage({params}: { params: Promise<{ locale: string; gameSlugOrId: string }> }) {
  const {locale, gameSlugOrId} = await params;
  // Sans cet appel, les fonctions serveur de next-intl lisent la langue à la
  // requête, ce qui suffit à rendre toute la route dynamique.
  setRequestLocale(locale);

  const game = await readGameBySlugOrId(gameSlugOrId);
  const t = await getTranslations("Games");
  if (!game?.features?.rules) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex flex-row flex-wrap justify-between">
          <div className="flex flex-row flex-wrap gap-4">
            <Button asChild>
              <Link href={`/games/${gameSlugOrId}`} className="text-blue-600 hover:underline">
                ← <span className="hidden lg:inline">{t("cards.back")}</span>
              </Link>
            </Button>
            <h1 className="text-3xl font-bold mb-4">{t("rules.notFoundTitle")}</h1>
          </div>
          <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'rules'}/>
        </div>
        <p>{t("rules.notFoundDescription")}</p>
      </div>
    )
  }

  const rulesDocuments = [{
    id: 'tr',
    name: t("rules.documents.tournamentRegulation"),
  }, {
    id: 'cr',
    name: t("rules.documents.coreRules"),
  }];

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-row flex-wrap justify-between">
        <div className="flex flex-row flex-wrap gap-4">
          <Button asChild>
            <Link href={`/games/${game.slug}`} className="text-blue-600 hover:underline">
              ← {t("rules.back")}
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-4">{t("rules.title", {gameName: game.name})}</h1>
        </div>
        <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'rules'}/>
      </div>
      <p className="mb-6">{t("rules.description", {gameName: game.name})}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rulesDocuments.map(doc => (
          <Link
            key={doc.id}
            href={`/games/${game.slug}/rules/${doc.id}`}
            className="block p-4 border rounded-lg hover:bg-gray-50 transition-colors"
          >
            <h2 className="text-xl font-semibold">{doc.name}</h2>
          </Link>
        ))}
      </div>
    </div>
  );

}
