import { NextResponse } from 'next/server';


const aggregatedNewsSources = [
    {
        gameId: "69009afea722eab4fa0e55c4",
        name: 'Riftbound Media',
        url: 'https://www.riftbound-media.fr/api/news',
        /*
            Supports pagination with ?limit=10&page=1
            Return type : {"data":[{"id":"9a6107a2-8716-490d-aad2-4fa0868de489","title":"PrÃ©parez vous pour les Avant-PremiÃ¨res Unleashed","slug":"preparez-vous-pour-ap","content":".......","image_url":"https://otbccpoavhfvjpqpzemz.supabase.co/storage/v1/object/public/article-images/articles/1777313544204-mv80zz.webp","tags":["Annonce Riot","Set 3"],"author_id":"8360c68b-53da-41b4-84bc-1b3467e294ec","published":true,"featured":false,"created_at":"2026-04-27T18:11:31.961589+00:00","updated_at":"2026-04-29T08:04:35.443844+00:00","sort_order":0,"published_at":"2026-04-27T15:24:00+00:00","highlighted":false,"article_number":35}],"meta":{"page":5,"limit":1,"total":39,"totalPages":39}}
        */
    },
];

export async function GET(req: Request) {
    if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {    
        console.info(`Rafraîchissement des actualités depuis les sites aggrégés...`);
        
        console.info(`Rafraîchissement des actualités terminé.`);
        return NextResponse.json({ 
            ok: true,
        });
    } catch (error) {
        console.error('Erreur lors du rafraîchissement des actualités:', error);
        return NextResponse.json({ 
            ok: false, 
            error: 'Erreur lors du rafraîchissement des actualités' 
        }, { status: 500 });
    }
}