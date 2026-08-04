import { ReactNode } from "react";
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

export function LegalHeader({
  title,
  description,
  updatedAt,
  children,
}: {
  title: string;
  description: string;
  updatedAt: string;
  children?: ReactNode;
}) {
  return (
    <header className="space-y-4 text-center">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
        Document légal
      </p>
      <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
      <p className="text-lg text-muted-foreground">{description}</p>
      <p className="text-sm text-muted-foreground">
        Dernière mise à jour : {updatedAt}
      </p>
      {children}
    </header>
  );
}

export function LegalSummary({ articles }: { articles: LegalArticle[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sommaire</CardTitle>
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

export function LegalArticles({ articles }: { articles: LegalArticle[] }) {
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

/** Liste à puces homogène entre les deux documents. */
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
