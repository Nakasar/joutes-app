import {NextResponse} from 'next/server';
import db from "@/lib/mongodb";
import {EventDocument} from "@/lib/db/events";
import {REST} from "@discordjs/rest";
import {Routes} from "discord-api-types/v10";
import {makeEventDiscordInfoMessage} from "@/lib/discord/utils";
import {GameDocument} from "@/lib/db/games";

const rest = new REST({version: "10"}).setToken(
  process.env.DISCORD_TOKEN ?? "",
);

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const eventsToUpdateCursor = db.collection<EventDocument>('events').find({
      discordBoards: {$exists: true},
      boardsNeedsUpdate: true,
    });

    if (await eventsToUpdateCursor.hasNext()) {
      const event = await eventsToUpdateCursor.next();
      if (event) {
        console.log(`Updating event ${event.id} (${event.name})...`);

        const board = event?.discordBoards?.[0];
        if (board) {
          console.log(`Updating board ${board.messageId} (${board.channelId})...`);

          const game = (event.gameName ? await db.collection<Pick<GameDocument, "_id" | "name" | "icon" | "banner" | "type">>('games').findOne({
            name: event.gameName,
          }, {
            projection: {
              _id: 1,
              name: 1,
              icon: 1,
              banner: 1,
              type: 1,
            }
          }) : undefined) || undefined;

          await rest.patch(Routes.channelMessage(
            board.channelId,
            board.messageId,
          ), {
            body: makeEventDiscordInfoMessage({...event, game}),
          }).catch(err => {
            console.warn('Failed to update board message (might have been deleted)');
          });
        }

        await db.collection<EventDocument>('events').updateOne({
          _id: event._id,
        }, {$set: {boardsNeedsUpdate: false}});
      }
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des boards discord des événements:', error);
    return NextResponse.json({
      ok: false,
      error: 'Erreur lors de la mise à jour des boards discord des événements.'
    }, {status: 500});
  }
}