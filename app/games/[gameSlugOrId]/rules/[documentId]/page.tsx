import type {Metadata} from 'next';
import RuleDocumentViewer from './RuleDocumentViewer';
import {getGameBySlugOrId} from '@/lib/db/games';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {getTranslations} from 'next-intl/server';
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar";
import {getHyperlinkedEntries, buildRuleTree, getRuleSections, RuleDocument, RuleLang} from '@/lib/rules/riftbound';

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

export default async function RulesDocumentPage({params, searchParams }: {
  params: Promise<{ gameSlugOrId: string; documentId: string; }>;
  searchParams: Promise<{ lang?: string }>
}) {
  const {documentId, gameSlugOrId} = await params;
  const { lang } = await searchParams;
  const t = await getTranslations('Games');

  const game = await getGameBySlugOrId(gameSlugOrId);
  if (!game) {
    return <div className="container mx-auto p-6">{t('rules.notFound.game')}</div>;
  }

  if (game.slug !== 'riftbound') {
    return <div className="container mx-auto p-6">{t('rules.notFound.unsupported')}</div>;
  }

  let document: RuleDocument;
  if (documentId.toLowerCase() === 'tr') {
    document = 'TR';
  } else if (documentId.toLowerCase() === 'cr') {
    document = 'CR';
  } else {
    return <div className="container mx-auto p-6">{t('rules.notFound.document')}</div>;
  }

  const ruleLang: RuleLang = lang === 'fr' ? 'fr' : 'en';
  const entries = getHyperlinkedEntries(document, ruleLang);
  const tree = buildRuleTree(entries);
  const sections = getRuleSections(tree);

  return (
    <div className="container mx-auto p-6">
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
      <p className="text-muted-foreground mt-1 text-sm mb-4">
        {t('rules.document.summary', {count: entries.length})}
      </p>
      <RuleDocumentViewer
        sections={sections}
        lang={ruleLang}
        document={document}
        gameSlug={game.slug}
      />
    </div>
  );
}