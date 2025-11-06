import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Heart } from "lucide-react";

export const metadata: Metadata = {
  title: "Open Source - Joutes",
  description: "Librairies et projets open source utilisés par Joutes.",
};

const dependencies = [
  {
    name: "@radix-ui/react-*",
    version: "diverses",
    description: "Composants UI accessibles et non-stylés (Dialog, Dropdown, Navigation, Select, Slot)",
    url: "https://www.radix-ui.com/",
  },
  {
    name: "@vercel/blob",
    version: "^2.0.0",
    description: "Solution de stockage pour les fichiers et images",
    url: "https://vercel.com/docs/storage/vercel-blob",
  },
  {
    name: "ai",
    version: "^5.0.70",
    description: "Framework pour construire des applications avec IA",
    url: "https://sdk.vercel.ai/",
  },
  {
    name: "better-auth",
    version: "^1.3.27",
    description: "Système d'authentification moderne et flexible",
    url: "https://www.better-auth.com/",
  },
  {
    name: "class-variance-authority",
    version: "^0.7.1",
    description: "Gestion des variants de classes CSS",
    url: "https://cva.style/",
  },
  {
    name: "clsx",
    version: "^2.1.1",
    description: "Utilitaire pour construire des chaînes de classes conditionnelles",
    url: "https://github.com/lukeed/clsx",
  },
  {
    name: "lucide-react",
    version: "^0.548.0",
    description: "Bibliothèque d'icônes open source belle et cohérente",
    url: "https://lucide.dev/",
  },
  {
    name: "luxon",
    version: "^3.7.2",
    description: "Bibliothèque moderne pour manipuler les dates et heures",
    url: "https://moment.github.io/luxon/",
  },
  {
    name: "mongodb",
    version: "^6.20.0",
    description: "Driver officiel MongoDB pour Node.js",
    url: "https://www.mongodb.com/docs/drivers/node/",
  },
  {
    name: "next",
    version: "15.5.2",
    description: "Framework React pour la production",
    url: "https://nextjs.org/",
  },
  {
    name: "node-html-markdown",
    version: "^1.3.0",
    description: "Convertisseur HTML vers Markdown",
    url: "https://github.com/crosstype/node-html-markdown",
  },
  {
    name: "qrcode",
    version: "^1.5.4",
    description: "Générateur de QR codes",
    url: "https://github.com/soldair/node-qrcode",
  },
  {
    name: "react",
    version: "19.1.0",
    description: "Bibliothèque JavaScript pour construire des interfaces utilisateur",
    url: "https://react.dev/",
  },
  {
    name: "react-dom",
    version: "19.1.0",
    description: "Point d'entrée pour React dans le DOM",
    url: "https://react.dev/",
  },
  {
    name: "tailwind-merge",
    version: "^3.3.1",
    description: "Utilitaire pour fusionner intelligemment les classes Tailwind CSS",
    url: "https://github.com/dcastil/tailwind-merge",
  },
  {
    name: "tailwindcss",
    version: "^4",
    description: "Framework CSS utility-first",
    url: "https://tailwindcss.com/",
  },
  {
    name: "zod",
    version: "^4.1.12",
    description: "Validation de schémas TypeScript-first",
    url: "https://zod.dev/",
  },
];

const devDependencies = [
  {
    name: "TypeScript",
    version: "^5",
    description: "Langage avec typage statique basé sur JavaScript",
    url: "https://www.typescriptlang.org/",
  },
  {
    name: "ESLint",
    version: "^9",
    description: "Outil de linting pour JavaScript et TypeScript",
    url: "https://eslint.org/",
  },
];

export default function OpenSourcePage() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="space-y-8">
        {/* En-tête */}
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold flex items-center justify-center gap-2">
            <Heart className="w-8 h-8 text-red-500" />
            Open Source
          </h1>
          <p className="text-xl text-muted-foreground">
            Joutes est construit sur les épaules de géants
          </p>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Nous utilisons l&apos;écosystème open source. Voici les principales 
            librairies et projets qui rendent Joutes possible.
          </p>
        </div>

        {/* Message de remerciement */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Heart className="w-5 h-5 text-red-500" />
              Merci à la communauté open source
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>
              Chaque librairie listée ci-dessous représente des heures de travail passionné de 
              développeurs du monde entier.
            </p>
            <div className="mt-4">
              <a 
                href="https://github.com/Joutes" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                Voir le code source sur GitHub
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Dépendances principales */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Dépendances principales</h2>
            <p className="text-muted-foreground">
              Les librairies essentielles qui alimentent les fonctionnalités de Joutes
            </p>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            {dependencies.map((dep) => (
              <Card key={dep.name} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{dep.name}</CardTitle>
                  </div>
                  <CardDescription>{dep.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <a 
                    href={dep.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    En savoir plus
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Dépendances de développement */}
        <div className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold mb-2">Outils de développement</h2>
            <p className="text-muted-foreground">
              Les outils qui nous aident à maintenir la qualité du code
            </p>
          </div>
          
          <div className="grid gap-4 md:grid-cols-2">
            {devDependencies.map((dep) => (
              <Card key={dep.name} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{dep.name}</CardTitle>
                  </div>
                  <CardDescription>{dep.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <a 
                    href={dep.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    En savoir plus
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Contribuer */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>Contribuer à Joutes</CardTitle>
            <CardDescription>
              Joutes est un projet ouvert aux contributions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              Que vous soyez développeur, designer, ou simplement passionné de jeux, il existe 
              de nombreuses façons de contribuer à Joutes :
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Signaler des bugs ou proposer de nouvelles fonctionnalités</li>
              <li>Contribuer du code via des pull requests</li>
              <li>Améliorer la documentation</li>
              <li>Partager vos retours d&apos;expérience</li>
              <li>Aider d&apos;autres utilisateurs sur Discord</li>
            </ul>
            <div className="flex flex-wrap gap-4 pt-2">
              <a 
                href="https://github.com/Joutes" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                GitHub
                <ExternalLink className="w-4 h-4" />
              </a>
              <a 
                href="https://discord.gg/dZEGkZwJGB" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                Discord
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
