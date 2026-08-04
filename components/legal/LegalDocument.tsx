import { ReactNode } from "react";
import { Languages } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Un article d'un document légal (CGU, politique de confidentialité).
 *
 * La numérotation n'est jamais écrite à la main : elle est dérivée de la
 * position dans le tableau, pour le sommaire comme pour les titres. Ajouter ou
 * déplacer un article ne peut donc pas désynchroniser les deux.
 */
export type LegalArticle = {
  /** Ancre de l'article, utilisée pour les liens profonds (#objet). */
  id: string;
  title: string;
  content: ReactNode;
};

/**
 * Un document légal dans une langue donnée. Les traductions vivent dans des
 * modules séparés (`content.fr.tsx`, `content.en.tsx`) et partagent cette
 * forme, si bien qu'une langue qui oublie une section ne compile pas.
 */
export type LegalDocumentContent = {
  meta: {
    title: string;
    description: string;
    keywords: string[];
  };
  /** Sur-titre affiché au-dessus du titre principal. */
  documentLabel: string;
  title: string;
  description: string;
  /** Compose la ligne de date à partir de la date déjà formatée. */
  lastUpdated: (formattedDate: string) => string;
  /** Liens vers les autres documents, affichés sous la date. */
  crossLinks: ReactNode;
  /** Avertissement affiché en tête des traductions de courtoisie. */
  translationNotice?: ReactNode;
  highlightTitle: string;
  highlight: ReactNode;
  summaryTitle: string;
  articles: LegalArticle[];
};

export function LegalDocumentView({
  content,
  formattedDate,
}: {
  content: LegalDocumentContent;
  formattedDate: string;
}) {
  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="space-y-8">
        <header className="space-y-4 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {content.documentLabel}
          </p>
          <h1 className="text-4xl font-bold tracking-tight">{content.title}</h1>
          <p className="text-lg text-muted-foreground">{content.description}</p>
          <p className="text-sm text-muted-foreground">
            {content.lastUpdated(formattedDate)}
          </p>
          <p className="text-sm text-muted-foreground">{content.crossLinks}</p>
        </header>

        {content.translationNotice && (
          <Alert>
            <Languages />
            <AlertDescription>{content.translationNotice}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{content.highlightTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {content.highlight}
          </CardContent>
        </Card>

        <LegalSummary title={content.summaryTitle} articles={content.articles} />

        <LegalArticles articles={content.articles} />
      </div>
    </div>
  );
}

function LegalSummary({ title, articles }: { title: string; articles: LegalArticle[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {articles.map((article, index) => (
            <li key={article.id} className="flex gap-2 text-sm">
              <span className="tabular-nums text-muted-foreground">{index + 1}.</span>
              <a href={`#${article.id}`} className="text-primary hover:underline">
                {article.title}
              </a>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function LegalArticles({ articles }: { articles: LegalArticle[] }) {
  return (
    <div className="space-y-6">
      {articles.map((article, index) => (
        <Card key={article.id} id={article.id} className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="text-xl">
              <span className="mr-2 tabular-nums text-muted-foreground">{index + 1}.</span>
              {article.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 leading-relaxed">{article.content}</CardContent>
        </Card>
      ))}
    </div>
  );
}

/** Liste à puces homogène entre les documents et les langues. */
export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6">{children}</ul>;
}

/** Tableau (finalités, sous-traitants, durées) scrollable sur mobile. */
export function LegalTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-xl border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            {headers.map((header) => (
              <th key={header} className="p-2 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b last:border-0 align-top">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="p-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Coordonnées de contact, identiques dans toutes les langues. */
export const LEGAL_CONTACT = {
  discord: "https://discord.gg/dZEGkZwJGB",
  github: "https://github.com/Joutes",
} as const;

/** Lien externe, avec les attributs de sécurité qui vont avec. */
export function LegalLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary hover:underline"
    >
      {children ?? href}
    </a>
  );
}
