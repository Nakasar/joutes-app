import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à Joutes pour gérer vos decks, votre collection, vos wishlists et rejoindre des événements près de chez vous.",
  keywords: ["connexion", "inscription", "login", "compte joutes"],
  openGraph: {
    title: "Connexion - Joutes",
    description: "Connectez-vous à Joutes pour gérer vos decks, votre collection, vos wishlists et rejoindre des événements près de chez vous.",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
