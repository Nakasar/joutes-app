import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Communauté",
    description: "Découvrez les profils des joueurs de la communauté Joutes : collections, decks et jeux favoris.",
    keywords: ["communauté", "joueurs", "profils", "jeux de cartes à collectionner", "réseau de joueurs"],
    openGraph: {
        url: `https://joutes.app/users`,
        siteName: 'Joutes',
        title: 'Communauté - Joutes',
        description: "Découvrez les profils des joueurs de la communauté Joutes.",
    },
};

export default function UsersPage() {
    return (
        <div>
            <h1>Users</h1>
        </div>
    );
}