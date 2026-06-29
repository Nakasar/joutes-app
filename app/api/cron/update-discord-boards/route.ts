import {NextResponse} from 'next/server';
import db from "@/lib/mongodb";
import {REST} from "@discordjs/rest";
import {Routes} from "discord-api-types/v10";
import {makeEventDiscordInfoMessage} from "@/lib/discord/utils";
import {DiscordBoard} from "@/app/discord/route";
import {getEventsByLairId} from "@/lib/db/events";
import {DateTime} from "luxon";
import {EmbedBuilder} from "@discordjs/builders";
import {DiscordEmojis} from "@/app/discord/utils";
import {getLairById} from "@/lib/db/lairs";
import {getGameById} from "@/lib/db/games";

const rest = new REST({version: "10"}).setToken(
  process.env.DISCORD_TOKEN ?? "",
);

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({error: 'Unauthorized'}, {status: 401});
  }

  try {
    const boardsToUpdateCursor = db.collection<DiscordBoard>('discord-boards').find({});

    if (await boardsToUpdateCursor.hasNext()) {
      const board = await boardsToUpdateCursor.next();
      if (board && board.lairs[0] && board.games[0]) {
        console.log(`Updating board ${board.messageId}`);

        const currentDate = DateTime.utc();

        const lair = await getLairById(board.lairs[0].id.toString())
        const game = await getGameById(board.games[0].id.toString())
        if (lair && game) {
          const events = await getEventsByLairId(board.lairs[0].id.toString(), {
            gameId: board.games[0].id.toString(),
            year: currentDate.year,
            month: currentDate.month,
          });

          await rest.patch(Routes.channelMessage(
            board.channelId,
            board.messageId,
          ), {
            body: {
              embeds: [
                new EmbedBuilder()
                  .setTitle(`Events - ${lair.name}`)
                  .setDescription(`Voici les évènements à venir :\n\n${events.length > 0 ? events.map(e => `-${e.game?.slug ? ` <:${e.game.slug}:${DiscordEmojis[e.game.slug] ?? ''}>` : ''} [${e.name}](https://joutes.app/events/${e.id}) le ${DateTime.fromISO(e.startDateTime, { zone: 'Europe/Paris', locale: 'fr' }).toLocaleString(DateTime.DATETIME_MED)}`).join('\n') : 'Aucun évènement à venir.'}`)
                  .setFooter({
                    text: `Updated: ${currentDate.setZone('Europe/Paris').toLocaleString(DateTime.DATETIME_MED, { locale: 'fr' })}`,
                  }),
              ],
              content: null,
            },
          }).catch(err => {
            console.warn('Failed to update board message (might have been deleted)');
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
    });
  } catch (error) {
    console.error('Erreur lors de la mise à jour des boards discord:', error);
    return NextResponse.json({
      ok: false,
      error: 'Erreur lors de la mise à jour des boards discord.'
    }, {status: 500});
  }
}