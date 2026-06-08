import {Event} from "@/lib/types/Event";
import {ActionRowBuilder, ButtonBuilder, EmbedBuilder} from "@discordjs/builders";
import {DateTime} from "luxon";
import {ButtonStyle} from "discord-api-types/v10";

export function makeEventDiscordInfoMessage(event: Event) {
  const fields = [
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
  return {
    content: null,
    embeds: [
      new EmbedBuilder()
        .setTitle(event.name)
        .setURL(`https://joutes.app/events/${event.id}`)
        .setImage(event?.game?.banner || "https://www.joutes.app/joutes.png")
        .setDescription(event.description || "-")
        .addFields(fields)
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
}