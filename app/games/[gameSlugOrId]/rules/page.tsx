import { Button } from "@/components/ui/button";
import { getGameBySlugOrId } from "@/lib/db/games";
import Link from "next/link";

export default async function GameRulesPage({ params} : { params: Promise<{ gameSlugOrId: string }> }) {
    const { gameSlugOrId } = await params;

    const game = await getGameBySlugOrId(gameSlugOrId);
    if (!game?.features?.rules) {
        return (
            <div className="container mx-auto p-6">
                <h1 className="text-3xl font-bold mb-4">Jeu non trouvé</h1>
                <p>Le jeu que vous recherchez n&apos;existe pas ou ne dispose pas de règles sur Joutes.</p>
            </div>
        )
    }

    const rulesDocuments = [{
        id: 'tr',
        name: 'Tournament Regulation',
    }, {
        id: 'cr',
        name: 'Core Rules',
    }];

    return (
        <div className="container mx-auto p-6">
            <h1 className="text-3xl font-bold mb-4">Règles de {game.name}</h1>
            <Button asChild>
                <Link href={`/games/${game.slug}`} className="text-blue-600 hover:underline">
                    ← Retour au portail du jeu
                </Link>
            </Button>
            <p className="mb-6">Voici les règles officielles de {game.name} disponibles sur Joutes.</p>
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