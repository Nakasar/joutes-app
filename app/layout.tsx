import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Joutes - Ligues et rencontres multi-jeux à proximité",
  description: "Ligues et rencontres multi-jeux à proximité pour les passionnés de jeux de cartes à collectionner et de jeux de société. Trouvez des événements organisés près de chez vous, connectez-vous avec votre communauté locale de joueurs, et découvrez des boutiques de jeux locales.",
  applicationName: "Joutes App",
  keywords: ["tcg", "board games", "events", "organized play", "local gaming community", "local game stores"],
  creator: "Nakasar",
  publisher: "Nakasar",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
