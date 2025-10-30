import { NextResponse } from 'next/server';
import { getAllLairs } from '@/lib/db/lairs';
import { refreshEvents } from '@/lib/services/refresh-events';

export async function GET(req: Request) {
    if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Récupérer tous les lairs
        const lairs = await getAllLairs();
        
        console.log(`Rafraîchissement des événements pour ${lairs.length} lairs...`);
        
        // Rafraîchir les événements pour chaque lair
        const results = await Promise.allSettled(
            lairs.map(async (lair) => {
                console.log(`Rafraîchissement des événements pour le lair ${lair.name} (${lair.id})...`);
                const result = await refreshEvents(lair.id);
                return { lairId: lair.id, lairName: lair.name, result };
            })
        );
        
        // Compter les succès et échecs
        const successes = results.filter(r => r.status === 'fulfilled' && r.value.result.success).length;
        const failures = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.result.success)).length;
        
        console.log(`Rafraîchissement terminé : ${successes} succès, ${failures} échecs`);
        
        // Retourner les résultats détaillés
        const detailedResults = results.map(r => {
            if (r.status === 'fulfilled') {
                return {
                    lairId: r.value.lairId,
                    lairName: r.value.lairName,
                    success: r.value.result.success,
                    message: r.value.result.success ? r.value.result.message : r.value.result.error
                };
            } else {
                return {
                    success: false,
                    error: r.reason
                };
            }
        });
        
        return NextResponse.json({ 
            ok: true,
            summary: {
                total: lairs.length,
                successes,
                failures
            },
            results: detailedResults
        });
    } catch (error) {
        console.error('Erreur lors du rafraîchissement des événements:', error);
        return NextResponse.json({ 
            ok: false, 
            error: 'Erreur lors du rafraîchissement des événements' 
        }, { status: 500 });
    }
}