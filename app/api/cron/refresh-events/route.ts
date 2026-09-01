import { NextResponse } from 'next/server';
import { getLairsWithEventSources } from '@/lib/db/lairs';
import { refreshEvents } from '@/lib/services/refresh-events';

/**
 * Combien de lieux sont moissonnés en même temps.
 *
 * Chaque lieu télécharge ses pages et appelle le modèle : tout lancer d'un
 * coup faisait tomber sur les limites de l'API et les délais des sites, et un
 * lieu en échec pour cette seule raison voyait ses sources comptées en panne.
 */
const CONCURRENCY = 3;

async function mapWithConcurrency<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;

    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (next < items.length) {
                const index = next++;
                results[index] = await task(items[index]);
            }
        })
    );

    return results;
}

export async function GET(req: Request) {
    if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Seuls les lieux qui ont une source : les autres n'ont rien à
        // rafraîchir, et les compter en échec noyait les vraies pannes.
        const lairs = await getLairsWithEventSources();

        console.log(`Rafraîchissement des événements pour ${lairs.length} lieux...`);

        const results = await mapWithConcurrency(lairs, CONCURRENCY, async (lair) => {
            console.log(`Rafraîchissement des événements pour le lieu ${lair.name} (${lair.id})...`);
            try {
                const result = await refreshEvents(lair.id);
                return { lairId: lair.id, lairName: lair.name, ...result };
            } catch (error) {
                console.error(`Rafraîchissement du lieu ${lair.id} en erreur:`, error);
                return { lairId: lair.id, lairName: lair.name, success: false as const, error: String(error) };
            }
        });

        const successes = results.filter((result) => result.success).length;
        const failures = results.length - successes;
        // Une source en panne dans un lieu qui a par ailleurs réussi : à
        // remonter aussi, sinon elle ne se voit que dans la fiche du lieu.
        const failingSources = results
            .filter((result) => result.success)
            .reduce((count, result) => count + result.report.sources.filter((source) => !source.ok).length, 0);

        console.log(`Rafraîchissement terminé : ${successes} succès, ${failures} échecs, ${failingSources} sources en panne`);

        return NextResponse.json({
            ok: true,
            summary: {
                total: lairs.length,
                successes,
                failures,
                failingSources,
            },
            results: results.map((result) => ({
                lairId: result.lairId,
                lairName: result.lairName,
                success: result.success,
                message: result.success ? result.message : result.error,
                sources: result.report?.sources ?? [],
            })),
        });
    } catch (error) {
        console.error('Erreur lors du rafraîchissement des événements:', error);
        return NextResponse.json({
            ok: false,
            error: 'Erreur lors du rafraîchissement des événements'
        }, { status: 500 });
    }
}
