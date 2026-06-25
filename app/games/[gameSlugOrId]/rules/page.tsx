import { Button } from "@/components/ui/button";
import { getGameBySlugOrId } from "@/lib/db/games";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function GameRulesPage({ params} : { params: Promise<{ gameSlugOrId: string }> }) {
    const { gameSlugOrId } = await params;

    const game = await getGameBySlugOrId(gameSlugOrId);
    const t = await getTranslations("Games");
    if (!game?.features?.rules) {
        return (
            <div className="container mx-auto p-6">
                <h1 className="text-3xl font-bold mb-4">{t("rules.notFoundTitle")}</h1>
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
            <h1 className="text-3xl font-bold mb-4">{t("rules.title", { gameName: game.name })}</h1>
            <Button asChild>
                <Link href={`/games/${game.slug}`} className="text-blue-600 hover:underline">
                    ← {t("rules.back")}
                </Link>
            </Button>
            <p className="mb-6">{t("rules.description", { gameName: game.name })}</p>
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