import type { Metadata } from 'next';
import tr from '@/data/riftbound/tr.json';
import cr from '@/data/riftbound/cr.json';
import RuleDocumentViewer from './RuleDocumentViewer';
import { getGameBySlugOrId } from '@/lib/db/games';

export const metadata: Metadata = {
  title: 'Riftbound Comprehensive Rules',
  description: 'Consult official comprehensive rules for Riftbound TCG.',
  openGraph: {
    title: 'Riftbound Comprehensive Rules',
    description: 'Consult official comprehensive rules for Riftbound TCG.',
  },
};

export default async function RulesDocumentPage({ params }: { params: Promise<{ gameSlugOrId: string; documentId: string }> }) {
    const { documentId, gameSlugOrId } = await params;

    const game = await getGameBySlugOrId(gameSlugOrId);
    if (!game) {
        return <div className="container mx-auto p-6">Jeu introuvable</div>;
    }

    if (game.slug !== 'riftbound') { 
        return <div className="container mx-auto p-6">Ce jeu ne dispose pas de règles sur Joutes.</div>;
    }

    let entries: { id: string; content: string }[];
    if (documentId === 'tr') {
        entries = tr;
    } else if (documentId === 'cr') {
        entries = cr;
    } else {
        return <div className="container mx-auto p-6">Document introuvable</div>;
    }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Règles de tournoi Riftbound</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {entries.length} entrées · Cliquez sur les liens bleus pour naviguer entre les règles
        </p>
      </div>
      <RuleDocumentViewer entries={entries} />
    </div>
  );
}