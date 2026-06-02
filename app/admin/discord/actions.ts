'use server';

import {REST} from "@discordjs/rest";
import {Routes} from 'discord-api-types/v10';
import {SlashCommandBuilder} from '@discordjs/builders';
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
      )
  ];

  const rest = new REST().setToken(process.env.DISCORD_TOKEN ?? '');

  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID ?? ''),
    {body: commands}
  );

  console.log('Commands updated.');
}