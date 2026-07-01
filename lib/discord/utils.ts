import {Event} from "@/lib/types/Event";
import {ActionRowBuilder, ButtonBuilder, EmbedBuilder} from "@discordjs/builders";
import {DateTime} from "luxon";
import {APIEmbedField, ButtonStyle} from "discord-api-types/v10";
import {DiscordEmojis} from "@/app/discord/utils";

export function makeEventDiscordInfoMessage(event: Event) {
  const fields: APIEmbedField[] = [
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
  ];
  if (event.game) {
    fields.push({
      inline: true,
      name: "Jeu",
      value: event.game.name,
    });
  }
  if (event.lair) {
    fields.push({
      name: "Lieu",
      value: event.lair.name,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle(event.name)
    .setURL(`https://joutes.app/events/${event.id}`)
    .setImage(event?.game?.banner || "https://www.joutes.app/joutes.png")
    .setDescription(event.description || "-")
    .addFields(fields);

  if (event.lair) {
    embed.setAuthor({
      name: event.lair.name,
      url: `https://joutes.app/lairs/${event.lairId}`,
    });
  }

  return {
    content: null,
    embeds: [
      embed.toJSON(),
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
}

export function makeEventsBoardDiscordMessage(boardId: string, date: DateTime, events: Event[]) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle(`Events`)
        .setDescription(`Voici les évènements à venir :\n\n${events.length > 0 ? events.map(e => `-${e.game?.slug ? ` <:${e.game.slug}:${DiscordEmojis[e.game.slug] ?? ''}>` : ''} [${e.name}](https://joutes.app/events/${e.id}) le ${DateTime.fromISO(e.startDateTime, {
          zone: 'Europe/Paris',
          locale: 'fr'
        }).toLocaleString(DateTime.DATETIME_MED)} à ${e.lair?.name ?? 'Lieu Inconnu'}`).join('\n') : 'Aucun évènement à venir.'}`)
        .setFooter({
          text: `Updated: ${date.setZone('Europe/Paris').toLocaleString(DateTime.DATETIME_MED, {locale: 'fr'})}`,
        }),
    ],
    content: null,
    components: [
      new ButtonBuilder()
        .setLabel("Actualiser")
        .setCustomId(`refresh-events-board-${boardId}`)
        .setStyle(ButtonStyle.Primary),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel("Modifier")
          .setCustomId(`modify-events-board-${boardId}`)
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
  };
}