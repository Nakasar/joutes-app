import type {Metadata} from 'next';
import tr from '@/data/riftbound/tr.json';
import cr from '@/data/riftbound/cr.json';
import RuleDocumentViewer from './RuleDocumentViewer';
import {getGameBySlugOrId} from '@/lib/db/games';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
import {getTranslations} from 'next-intl/server';
import {GameToolsNavBar} from "@/components/games/GameToolsNavBar";

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

export default async function RulesDocumentPage({params}: {
  params: Promise<{ gameSlugOrId: string; documentId: string }>
}) {
  const {documentId, gameSlugOrId} = await params;
  const t = await getTranslations('Games');

  const game = await getGameBySlugOrId(gameSlugOrId);
  if (!game) {
    return <div className="container mx-auto p-6">{t('rules.notFound.game')}</div>;
  }

  if (game.slug !== 'riftbound') {
    return <div className="container mx-auto p-6">{t('rules.notFound.unsupported')}</div>;
  }

  let entries: { id: string; content: string }[];
  if (documentId.toLowerCase() === 'tr') {
    entries = tr;
  } else if (documentId.toLowerCase() === 'cr') {
    entries = cr;
  } else {
    return <div className="container mx-auto p-6">{t('rules.notFound.document')}</div>;
  }

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
      <RuleDocumentViewer entries={entries}/>
    </div>
  );
}