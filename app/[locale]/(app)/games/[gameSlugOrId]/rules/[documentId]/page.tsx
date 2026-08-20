import type {Metadata} from 'next';
import {Suspense} from 'react';
import RuleDocumentViewer from './RuleDocumentViewer.tsx';
import {readGameBySlugOrId} from '@/lib/db/games-cached.ts';
import { Link } from "@/i18n/navigation.ts";
import {Button} from '@/components/ui/button.tsx';
import {getTranslations} from 'next-intl/server';
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar.tsx";
import {GameToolHeaderSkeleton} from "@/components/games/GameToolSkeletons.tsx";
import {getHyperlinkedEntries, buildRuleTree, getRuleSections, RuleDocument, RuleLang} from '@/lib/rules/riftbound.ts';

type DocumentParams = Promise<{ gameSlugOrId: string; documentId: string }>;

interface RulesDocumentPageProps {
  params: DocumentParams;
  searchParams: Promise<{ lang?: string }>;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Games');

  return {
    title: t('rules.metadata.title'),
    description: t('rules.metadata.description'),
    openGraph: {
      title: t('rules.metadata.title'),
      description: t('rules.metadata.description'),
    },
  };
}

/**
 * Deux frontières : l'en-tête ne dépend que du jeu, le document dépend en plus
 * de la langue de lecture demandée en query. Les séparer évite que le titre
 * clignote à chaque bascule de langue.
 */
export default function RulesDocumentPage({params, searchParams}: RulesDocumentPageProps) {
  return (
    <div className="container mx-auto p-6">
      <Suspense fallback={<GameToolHeaderSkeleton titleWidth="w-96" />}>
        <DocumentHeader params={params} />
      </Suspense>

      <Suspense fallback={<DocumentSkeleton />}>
        <DocumentBody params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function DocumentSkeleton() {
  return (
    <div className="animate-pulse space-y-4" aria-hidden>
      <div className="mt-1 mb-4 h-5 w-64 rounded bg-muted/60" />
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 w-full rounded bg-muted/60" />
          <div className="h-4 w-5/6 rounded bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

/**
 * Le titre suppose que le jeu existe et gère les règles. Les cas contraires
 * sont traités par le corps, qui seul sait de quel échec il s'agit — jeu
 * inconnu, jeu sans règles, ou document inconnu.
 */
async function DocumentHeader({params}: { params: DocumentParams }) {
  const {gameSlugOrId} = await params;
  const t = await getTranslations('Games');
  const game = await readGameBySlugOrId(gameSlugOrId);

  if (!game || game.slug !== 'riftbound') {
    return null;
  }

  return (
    <div className="flex flex-row flex-wrap justify-between">
      <div className="flex flex-row flex-wrap gap-4">
        <Button asChild>
          <Link href={`/games/${game.slug}/rules`} className="text-blue-600 hover:underline">
            ← {t('rules.backToList')}
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{t('rules.document.title', {gameName: game.name})}</h1>
      </div>
      <GameToolsNavBar gameSlug={gameSlugOrId} currentTab={'rules'}/>
    </div>
  );
}

async function DocumentBody({params, searchParams}: RulesDocumentPageProps) {
  const {documentId, gameSlugOrId} = await params;
  const { lang } = await searchParams;
  const t = await getTranslations('Games');

  const game = await readGameBySlugOrId(gameSlugOrId);
  if (!game) {
    return <>{t('rules.notFound.game')}</>;
  }

  if (game.slug !== 'riftbound') {
    return <>{t('rules.notFound.unsupported')}</>;
  }

  let document: RuleDocument;
  if (documentId.toLowerCase() === 'tr') {
    document = 'TR';
  } else if (documentId.toLowerCase() === 'cr') {
    document = 'CR';
  } else {
    return <>{t('rules.notFound.document')}</>;
  }

  const ruleLang: RuleLang = lang === 'fr' ? 'fr' : 'en';
  const entries = getHyperlinkedEntries(document, ruleLang);
  const tree = buildRuleTree(entries);
  const sections = getRuleSections(tree);

  return (
    <>
      <p className="text-muted-foreground mt-1 text-sm mb-4">
        {t('rules.document.summary', {count: entries.length})}
      </p>
      <RuleDocumentViewer
        sections={sections}
        lang={ruleLang}
        document={document}
        gameSlug={game.slug}
      />
    </>
  );
}
