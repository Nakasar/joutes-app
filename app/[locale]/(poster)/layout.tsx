import type { Metadata } from "next";
import {
  Caveat,
  Cinzel,
  Cormorant_Garamond,
  Crimson_Pro,
  EB_Garamond,
  Exo_2,
  Geist,
  Geist_Mono,
  MedievalSharp,
  Nunito,
  Orbitron,
  Pirata_One,
  Rajdhani,
  Share_Tech_Mono,
} from "next/font/google";

import "@/components/posters/poster.css";

/**
 * La coquille des affiches : une page nue, sans en-tête ni pied de site.
 *
 * Un groupe de routes à part plutôt qu'une page de l'application : l'affiche
 * se regarde seule, s'imprime seule, se charge dans l'aperçu de l'écran de
 * gestion — le cadre du site n'y a rien à faire, et son CSS global non plus.
 *
 * Les polices des sept styles sont posées ici, en variables, comme le fait le
 * layout principal pour Geist. Elles ne se chargent que sur cette route.
 */
export function generateStaticParams() {
  return [{ locale: "fr" }, { locale: "en" }];
}

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["700"] });
const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin"], weight: ["600", "700", "800"] });
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["700"] });
const ebGaramond = EB_Garamond({ variable: "--font-eb-garamond", subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"] });
const orbitron = Orbitron({ variable: "--font-orbitron", subsets: ["latin"], weight: ["700", "800"] });
const rajdhani = Rajdhani({ variable: "--font-rajdhani", subsets: ["latin"], weight: ["500", "700"] });
const shareTechMono = Share_Tech_Mono({ variable: "--font-share-tech-mono", subsets: ["latin"], weight: ["400"] });
const medievalSharp = MedievalSharp({ variable: "--font-medievalsharp", subsets: ["latin"], weight: ["400"] });
const crimsonPro = Crimson_Pro({ variable: "--font-crimson-pro", subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"] });
const exo2 = Exo_2({ variable: "--font-exo2", subsets: ["latin"], weight: ["500", "700", "800"] });
const pirataOne = Pirata_One({ variable: "--font-pirata-one", subsets: ["latin"], weight: ["400"] });
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["500", "700"], style: ["normal", "italic"] });

const FONT_VARIABLES = [
  geist,
  geistMono,
  caveat,
  nunito,
  cinzel,
  ebGaramond,
  orbitron,
  rajdhani,
  shareTechMono,
  medievalSharp,
  crimsonPro,
  exo2,
  pirataOne,
  cormorant,
]
  .map((font) => font.variable)
  .join(" ");

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function PosterLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html suppressHydrationWarning>
      <body className={FONT_VARIABLES} style={{ margin: 0, background: "#e5e5e5" }}>
        {children}
      </body>
    </html>
  );
}
