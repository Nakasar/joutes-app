import { NextResponse } from 'next/server';
import db from "@/lib/mongodb";
import {EventDocument} from "@/lib/db/events";
import {REST} from "@discordjs/rest";
import {Routes} from "discord-api-types/v10";
import {ActionRowBuilder, ButtonBuilder, EmbedBuilder} from "@discordjs/builders";
import {DateTime} from "luxon";
import {ButtonStyle} from "discord-api-types/v8";

const rest = new REST({version: "10"}).setToken(
  process.env.DISCORD_TOKEN ?? "",
);

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const eventsToUpdateCursor = db.collection<EventDocument>('events').find({
      discordBoardIds: { $exists: true },
      boardsNeedsUpdate: true,
    });

    if (await eventsToUpdateCursor.hasNext()) {
      const event = await eventsToUpdateCursor.next();
      if (event) {
        console.log(`Updating event ${event.id} (${event.name})...`);

        const board = event?.discordBoardIds?.[0];
        if (board) {
          console.log(`Updating board ${board.messageId} (${board.channelId})...`);

          await rest.patch(Routes.channelMessage(
            board.channelId,
            board.messageId,
          ), {
            body: {
              content: "",
              embeds: [
                new EmbedBuilder()
                  .setTitle(event.name)
                  .setURL(`https://joutes.app/events/${event.id}`)
                  .setImage("https://www.joutes.app/joutes.png")
                  .setDescription(event.description ?? "-")
                  .addFields([
                    {
                      inline: true,
                      name: "Début",
                      value: DateTime.fromISO(event.startDateTime, {zone: "Europe/Paris"}).setLocale('fr').toLocaleString(DateTime.DATETIME_FULL),
                    },
                    {
                      inline: true,
                      name: "Fin",
                      value: DateTime.fromISO(event.endDateTime, {zone: "Europe/Paris"}).setLocale('fr').toLocaleString(DateTime.DATETIME_FULL),
                    },
                    {
                      inline: true,
                      name: "Participants",
                      value: `${event.participants?.length.toString() ?? "Aucun"}${event.maxParticipants ? `/ ${event.maxParticipants}` : ""}`,
                    },
                    {
                      inline: true,
                      name: "Prix",
                      value: event.price ? `${event.price.toString()} €` : "Gratuit/Non précisé",
                    },
                  ])
                  .toJSON(),
              ],
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Voir l'évènement")
                    .setURL(event.url ?? `https://joutes.app/events/${event.id}`)
                    .setStyle(ButtonStyle.Link),
                  new ButtonBuilder()
                    .setLabel("S'inscrire")
                    .setCustomId(`event-registration-${event.id}`)
                    .setStyle(ButtonStyle.Primary),
                ),
              ],
            }
          }).catch(err => {
            console.warn('Failed to update board message (might have been deleted)');
          });
        }

        await db.collection<EventDocument>('events').updateOne({
          _id: event._id,
        }, { $set: { boardsNeedsUpdate: false } });
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
    }, { status: 500 });
  }
}