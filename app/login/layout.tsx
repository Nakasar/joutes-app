import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à Joutes pour gérer vos decks, votre collection, vos wishlists et rejoindre des événements près de chez vous.",
  keywords: ["connexion", "inscription", "login", "compte joutes"],
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
