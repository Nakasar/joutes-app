'use server';

import {REST} from "@discordjs/rest";
import {Routes, ApplicationCommandType} from 'discord-api-types/v10';
import {ContextMenuCommandBuilder, SlashCommandBuilder} from '@discordjs/builders';
import { requireAdmin } from "@/lib/middleware/admin";

export async function registerDiscordCommands() {
  await requireAdmin();

  console.log('Updating commands...');
  const commands = [
    new SlashCommandBuilder()
      .setName('ask')
      .setNameLocalization('fr', 'demander')
      .setDescription('Ask a question to the bot')
      .setDescriptionLocalization('fr', 'Poser une question au bot')
      .addStringOption(option =>
        option.setName('message')
          .setNameLocalization('fr', 'message')
          .setDescription('Your message to the bot')
          .setDescriptionLocalization('fr', 'Votre message au bot')
          .setRequired(true)
      )
      .toJSON(),
    new SlashCommandBuilder()
      .setName('card')
      .setNameLocalization('fr', 'carte')
      .setDescription('Retrieve info and rulings for a card')
      .setDescriptionLocalization('fr', 'Récupère les infos et les rulings pour une carte')
      .addStringOption(option =>
        option.setName('name')
          .setNameLocalization('fr', 'nom')
          .setDescription('Name of the card')
          .setDescriptionLocalization('fr', 'Nom de la carte')
          .setRequired(true)
      ).addStringOption(option =>
        option.setName('game')
          .setNameLocalization('fr', 'jeu')
          .setDescription('Name of the game')
          .setDescriptionLocalization('fr', 'Nom du jeu')
          .setRequired(false)
      ),
    new SlashCommandBuilder()
      .setName('verify-deck')
      .setNameLocalization('fr', 'vérifier-deck')
      .setDescription('Retrieve info and rulings for a deck')
      .setDescriptionLocalization('fr', 'Analyse un deck et retourne le détails des cartes')
      .addStringOption(option =>
        option.setName('link-or-code')
          .setNameLocalization('fr', 'lien-ou-code')
          .setDescription('PiltoverArchive link or code')
          .setDescriptionLocalization('fr', 'Code ou lien PiltoverArchive')
          .setRequired(true)
      ).addStringOption(option =>
      option.setName('game')
        .setNameLocalization('fr', 'jeu')
        .setDescription('Name of the game')
        .setDescriptionLocalization('fr', 'Nom du jeu')
        .setRequired(false)
    ),
    new SlashCommandBuilder()
      .setName('policies')
      .setNameLocalization('fr', 'politiques')
      .setDescription('Search policies')
      .setDescriptionLocalization('fr', 'Recherche les politiques')
      .addStringOption(option =>
        option.setName('query')
          .setNameLocalization('fr', 'recherche')
          .setDescription('Search query')
          .setDescriptionLocalization('fr', 'Votre recherche')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('rules')
      .setNameLocalization('fr', 'regles')
      .setDescription('Search rules')
      .setDescriptionLocalization('fr', 'Recherche les règles')
      .addStringOption(option =>
        option.setName('query')
          .setNameLocalization('fr', 'recherche')
          .setDescription('Search query')
          .setDescriptionLocalization('fr', 'Votre recherche')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('events-board')
      .setDescription('Create an events board')
      .setDescriptionLocalization('fr', 'Créer un tableau d’évènements')
      .addStringOption(option =>
        option.setName('game')
          .setNameLocalization('fr', 'jeu')
          .setDescription('Initial game to display on this board')
          .setDescriptionLocalization('fr', 'Jeu initial à afficher sur ce tableau')
          .setRequired(true)
      )
      .addStringOption(option =>
        option.setName('lair')
          .setNameLocalization('fr', 'lieu')
          .setDescription('Initial lair to track on this board')
          .setDescriptionLocalization('fr', 'Lieu initial à afficher sur ce tableau')
          .setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName('events')
      .setDescription("Manage events")
      .setDescriptionLocalization('fr', 'Gérer les évènements')
      .addSubcommand(builder =>
        builder.setName('info')
          .setDescription("Get event information")
          .setDescriptionLocalization('fr', 'Afficher les informations')
          .addStringOption(option => option.setName('link').setDescription('Event ID or URL').setDescriptionLocalization('fr', "ID ou URL d'évènement").setRequired(true))
      )
      .addSubcommand(builder =>
        builder.setName('board')
          .setNameLocalization('fr', 'tableau')
          .setDescription("Display an info board automatically updated for an event")
          .setDescriptionLocalization('fr', "Afficher un tableau d'information mis à jour automatiquement pour un évènement")
          .addStringOption(option => option.setName('link').setDescription('Event ID or URL').setDescriptionLocalization('fr', "ID ou URL d'évènement").setRequired(true))
      ),
    new ContextMenuCommandBuilder()
      .setName('Verify Deck')
      .setNameLocalization('fr', 'Vérifier le deck')
      .setType(ApplicationCommandType.Message)
  ];

  const rest = new REST().setToken(process.env.DISCORD_TOKEN ?? '');

  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID ?? ''),
    {body: commands}
  );

  console.log('Commands updated.');
}