import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import { DateTime } from "luxon";

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
  openGraph: {
    url: "https://joutes.app",
    title: "Joutes - Ligues et rencontres multi-jeux à proximité",
    description: "Ligues et rencontres multi-jeux à proximité pour les passionnés de jeux de cartes à collectionner et de jeux de société. Trouvez des événements organisés près de chez vous, connectez-vous avec votre communauté locale de joueurs, et découvrez des boutiques de jeux locales.",
    images: [
      {
        url: "https://joutes.app/joutes.png",
        width: 720,
        height: 404,
        alt: "Joutes App",
      },
    ],
    siteName: "Joutes",
    locale: "fr_FR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <div className="relative min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t py-6 mt-auto">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              <p>© {DateTime.now().year} Joutes - Ligues et rencontres multi-jeux</p>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
