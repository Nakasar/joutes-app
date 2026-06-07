import {REST} from "@discordjs/rest";
import {
  APIChatInputApplicationCommandInteraction, APIMessageComponentButtonInteraction,
  APIMessageComponentInteraction,
  ComponentType,
  InteractionType,
  Routes,
} from "discord-api-types/v10";
import {verify} from "discord-verify/node";
import {NextResponse} from "next/server";
import crypto from "node:crypto";
import db from "@/lib/mongodb";
import {BoosterCard} from "@/lib/types/booster";
import {ActionRowBuilder, ButtonBuilder, EmbedBuilder} from "@discordjs/builders";
import {getErratasByCardId} from "@/lib/db/erratas";
import {Game} from "@/lib/types/Game";
import {addParticipantToEvent, getEventById, removeParticipantFromEvent} from "@/lib/db/events";
import {DateTime} from "luxon";
import {ButtonStyle} from "discord-api-types/v8";
import {ObjectId} from "mongodb";
import {RegistrationStatus} from "@/lib/types/Event";

const agentId = "yGypfIpDEb";
const aiAllowedDiscordIds = JSON.parse(
  process.env.AI_ALLOWED_DISCORD_IDS ?? "[]",
) as string[];

const rest = new REST({version: "10"}).setToken(
  process.env.DISCORD_TOKEN ?? "",
);

export async function POST(req: Request) {
  const body = await req.json();

  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const rawBody = JSON.stringify(body);

  const isValid = await verify(
    rawBody,
    signature,
    timestamp,
    process.env.DISCORD_PUBLIC_KEY ?? "",
    crypto.webcrypto.subtle,
  );

  if (!isValid) {
    console.warn("Invalid request signature");
    return NextResponse.json({success: false}, {status: 403});
  }

  if (body.type === 1) {
    return NextResponse.json({type: 1});
  } else if (body.type === InteractionType.ApplicationCommand) {
    return handleApplicationCommand(
      body as APIChatInputApplicationCommandInteraction,
    );
  } else if (body.type === InteractionType.MessageComponent) {
    return handleComponentInteraction(
      body as APIMessageComponentInteraction,
    );
  }

  return NextResponse.json({success: true}, {status: 200});
}

async function handleComponentInteraction(
  body: APIMessageComponentInteraction,
) {
  switch (body.data.component_type) {
    case ComponentType.Button:
      return handleComponentButtonInteraction(body as APIMessageComponentButtonInteraction);
    default:
      await rest.post(
        Routes.interactionCallback(body.id, body.token),
        {
          body: {
            type: 4,
            data: {
              content: "Commande inconnue.",
              flags: 64, // Ephemeral
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
  }
}

async function handleComponentButtonInteraction(interaction: APIMessageComponentButtonInteraction) {
  if (interaction.data.custom_id.startsWith("event-registration-")) {
    const discordUserId = interaction.user?.id || interaction.member?.user?.id;
    const user = discordUserId ? await db.collection<{ userId: ObjectId }>('account').findOne({
        providerId: 'discord',
        accountId: discordUserId,
      }).then(discordUser => {
        if (discordUser?.userId) {
          return db.collection<{ displayName?: string; discriminator?: string }>('user').findOne({
            _id: discordUser.userId,
          })
        } else {
          return null;
        }
    }) : null;
    if (!user) {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: "Votre compte Discord ne semble pas connecté à un compte Joutes.",
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Lier mon compte Joutes")
                    .setURL(`https://joutes.app/account/security`)
                    .setStyle(ButtonStyle.Link),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }

    const eventId = interaction.data.custom_id.split('event-registration-')[1];
    const event = await getEventById(eventId);

    if (!event) {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: "Cet évènement n'existe pas ou ne vous est pas accessible.",
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Voir sur Joutes")
                    .setURL(`https://joutes.app/events/${eventId}`)
                    .setStyle(ButtonStyle.Link),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }

    const currentRegistrationStatus: RegistrationStatus = (event.preRegistration ? event.participantRegistrations?.[user._id.toString()] : (event.participants?.includes(user._id.toString()) ? "REGISTERED" : "NOT_REGISTERED")) ?? 'NOT_REGISTERED';

    if (currentRegistrationStatus === 'REGISTERED') {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Actuellement vous êtes enregistré pour cet évènement.`,
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Me désinscrire")
                    .setCustomId(`event-unregister-${event.id}`)
                    .setStyle(ButtonStyle.Danger),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    } else if (currentRegistrationStatus === 'PRE_REGISTERED') {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Actuellement vous êtes pré-enregistré pour cet évènement, et votre inscription est en attente de validation par l'organisateur du tournoi.`,
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Me désinscrire")
                    .setCustomId(`event-unregister-${event.id}`)
                    .setStyle(ButtonStyle.Danger),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    } else if (currentRegistrationStatus === 'EXCLUDED') {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Actuellement vous êtes noté comme exclu de cet évènement par l'organisateur et ne pouvez pas vous réinscrire.`,
              flags: 64, // Ephemeral
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    } else if (currentRegistrationStatus === 'NOT_REGISTERED') {
      if (event.allowJoin) {
        if (event.preRegistration) {
          await addParticipantToEvent(eventId, user._id.toString(), "PRE_REGISTERED");

          await rest.post(
            Routes.interactionCallback(interaction.id, interaction.token),
            {
              body: {
                type: 4,
                data: {
                  content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Votre demande d'inscription est bien enregistrée et est en attente de la part de l'organisateur du tournoi.`,
                  flags: 64, // Ephemeral
                  components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                      new ButtonBuilder()
                        .setLabel("Me désinscrire")
                        .setCustomId(`event-unregister-${event.id}`)
                        .setStyle(ButtonStyle.Danger),
                    ),
                  ],
                },
              },
            },
          );
          return NextResponse.json({success: true}, {status: 200});
        } else {
          await addParticipantToEvent(eventId, user._id.toString(), "REGISTERED");

          await rest.post(
            Routes.interactionCallback(interaction.id, interaction.token),
            {
              body: {
                type: 4,
                data: {
                  content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Vous êtes désormais enregistré pour cet évènement.`,
                  flags: 64, // Ephemeral
                  components: [
                    new ActionRowBuilder<ButtonBuilder>().addComponents(
                      new ButtonBuilder()
                        .setLabel("Me désinscrire")
                        .setCustomId(`event-unregister-${event.id}`)
                        .setStyle(ButtonStyle.Danger),
                    ),
                  ],
                },
              },
            },
          );
          return NextResponse.json({success: true}, {status: 200});
        }
      } else {
        await rest.post(
          Routes.interactionCallback(interaction.id, interaction.token),
          {
            body: {
              type: 4,
              data: {
                content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Cet évènement ne semble pas accepter pas les inscriptions (pour les évènements privés, contactez plutôt l'organisateur afin de recevoir un code d'invitation).`,
                flags: 64, // Ephemeral
              },
            },
          },
        );
        return NextResponse.json({success: true}, {status: 200});
      }
    }
  } else if (interaction.data.custom_id.startsWith("event-unregister-")) {
    const discordUserId = interaction.user?.id || interaction.member?.user?.id;
    const user = discordUserId ? await db.collection<{ userId: ObjectId }>('account').findOne({
      providerId: 'discord',
      accountId: discordUserId,
    }).then(discordUser => {
      if (discordUser?.userId) {
        return db.collection<{ displayName?: string; discriminator?: string }>('user').findOne({
          _id: discordUser.userId,
        })
      } else {
        return null;
      }
    }) : null;
    if (!user) {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: "Votre compte Discord ne semble pas connecté à un compte Joutes.",
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Lier mon compte Joutes")
                    .setURL(`https://joutes.app/account/security`)
                    .setStyle(ButtonStyle.Link),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }

    const eventId = interaction.data.custom_id.split('event-registration-')[1];
    const event = await getEventById(eventId);

    if (!event) {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: "Cet évènement n'existe pas ou ne vous est pas accessible.",
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Voir sur Joutes")
                    .setURL(`https://joutes.app/events/${eventId}`)
                    .setStyle(ButtonStyle.Link),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }

    const currentRegistrationStatus: RegistrationStatus = (event.preRegistration ? event.participantRegistrations?.[user._id.toString()] : (event.participants?.includes(user._id.toString()) ? "REGISTERED" : "NOT_REGISTERED")) ?? 'NOT_REGISTERED';

    if (currentRegistrationStatus === 'REGISTERED' || currentRegistrationStatus === 'PRE_REGISTERED') {
      await removeParticipantFromEvent(eventId, user._id.toString());

      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Vous êtes bien désinscrit de l'évènement !`,
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("Me réinscrire")
                    .setCustomId(`event-register-${event.id}`)
                    .setStyle(ButtonStyle.Primary),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    } else {
      await rest.post(
        Routes.interactionCallback(interaction.id, interaction.token),
        {
          body: {
            type: 4,
            data: {
              content: `Bonjour ${user.displayName ?? 'utilisateur anonyme'}#${user.discriminator ?? ''} ! Actuellement vous n'êtes pas inscrit à cet évènement.`,
              flags: 64, // Ephemeral
              components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                  new ButtonBuilder()
                    .setLabel("M'inscrire")
                    .setCustomId(`event-register-${event.id}`)
                    .setStyle(ButtonStyle.Primary),
                ),
              ],
            },
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }
  } else {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Commande inconnue.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }
}

async function handleApplicationCommand(
  body: APIChatInputApplicationCommandInteraction,
) {
  switch (body.data.name) {
    case "ask":
      return handleAskCommand(body);
    case "card":
      return handleCardCommand(body);
    case "rules":
      return handleRulesCommand(body);
    case "events":
      return handleEventsCommand(body);
    case "policies":
      return handlePoliciesCommand(body);
  }
}

async function handleEventsCommand(interaction: APIChatInputApplicationCommandInteraction) {
  console.log(interaction.data.options);
  const subCommand = interaction.data.options?.find(o => o.type === 1);
  if (!subCommand) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Commande inconnue.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }

  if (subCommand.name === 'info') {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Je cherche cet évènement...",
          },
        },
      },
    );

    const link = subCommand.options?.find(
      (option: { name: string; type: number }) => option.name === "link" && option.type === 3,
    ) as { value: string } | undefined;
    if (!link?.value) {
      await rest.patch(
        Routes.webhookMessage(
          interaction.application_id,
          interaction.token,
          "@original",
        ),
        {
          body: {
            content: "Veuillez indiquer l'ID ou l'URL de l'évènement sur [Joutes](https://joutes.app).",
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }

    const eventId = link.value.split('/').pop();
    if (!eventId) {
      await rest.patch(
        Routes.webhookMessage(
          interaction.application_id,
          interaction.token,
          "@original",
        ),
        {
          body: {
            content: "L'ID ou l'URL de l'évènement sur [Joutes](https://joutes.app) n'est pas correct.",
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }

    const event = await getEventById(eventId);
    if (!event || !event.lairId) {
      await rest.patch(
        Routes.webhookMessage(
          interaction.application_id,
          interaction.token,
          "@original",
        ),
        {
          body: {
            content: "L'évènement n'existe pas ou ne vous est pas accessible.",
          },
        },
      );
      return NextResponse.json({success: true}, {status: 200});
    }

    await rest.patch(
      Routes.webhookMessage(
        interaction.application_id,
        interaction.token,
        "@original",
      ),
      {
        body: {
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
                  value: DateTime.fromISO(event.startDateTime, { zone: "Europe/Paris" }).setLocale('fr').toLocaleString(DateTime.DATETIME_FULL),
                },
                {
                  inline: true,
                  name: "Fin",
                  value: DateTime.fromISO(event.endDateTime, { zone: "Europe/Paris" }).setLocale('fr').toLocaleString(DateTime.DATETIME_FULL),
                },
                {
                  inline: true,
                  name: "Participants",
                  value: `${event.participants?.length.toString() ?? "Aucun"}${event.maxParticipants ? `/ ${event.maxParticipants}`: ""}`,
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
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  } else {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Commande inconnue.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }
}

async function handleCardCommand(
  interaction: APIChatInputApplicationCommandInteraction,
) {
  await rest.post(
    Routes.interactionCallback(interaction.id, interaction.token),
    {
      body: {
        type: 4,
        data: {
          content: "Je cherche cette carte !",
        },
      },
    },
  );

  const name = interaction.data.options?.find(
    (option: { name: string; type: number }) => option.name === "name" && option.type === 3,
  ) as { value: string } | undefined;
  if (!name?.value) {
    await rest.patch(
      Routes.webhookMessage(
        interaction.application_id,
        interaction.token,
        "@original",
      ),
      {
        body: {
          content: "Veuillez préciser un nom de carte.",
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }

  const gameName = interaction.data.options?.find(
    (option: { name: string; type: number }) => option.name === "game" && option.type === 3,
  ) as { value: string } | undefined;

  const game = await db.collection<Game>("games").findOne({$or: [{name: gameName?.value ?? 'riftbound'}, {slug: gameName?.value ?? 'riftbound'}]});
  if (!game) {
    await rest.patch(
      Routes.webhookMessage(
        interaction.application_id,
        interaction.token,
        "@original",
      ),
      {
        body: {
          content: "Veuillez fournir un nom de jeu.",
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }

  const card = await db.collection<BoosterCard>("cards").findOne({name: name.value, gameId: game?._id});

  if (!card) {
    await rest.patch(
      Routes.webhookMessage(
        interaction.application_id,
        interaction.token,
        "@original",
      ),
      {
        body: {
          content: "Cette carte n'a pas été trouvée",
        },
      },
    );

    return NextResponse.json({success: true}, {status: 200});
  }

  const erratas = await getErratasByCardId(card.id);

  await rest.patch(
    Routes.webhookMessage(
      interaction.application_id,
      interaction.token,
      "@original",
    ),
    {
      body: {
        embeds: [
          new EmbedBuilder()
            .setTitle(card.name)
            .setURL(`https://tools.joutes.app/${game.slug}/cards/${card.cardId ?? ""}`)
            .setImage(card.image ?? undefined)
            .setDescription(`This card has ${erratas.length} erratas.\n\nErratas details:\n${erratas.map((e, index) => `\n${index + 1}. Type: ${e.type}, Details: ${e.details}, Source: ${e.source}, Errata ID: ${e.id}`).join("\n")}`)
            .toJSON(),
        ],
      },
    },
  );
}

async function handleRulesCommand(
  interaction: APIChatInputApplicationCommandInteraction,
) {
  const query = interaction.data.options?.find(
    (option: { name: string; type: number }) => option.name === "query" && option.type === 3,
  ) as { value: string } | undefined;
  if (!query?.value) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Veuillez fournir une recherche",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }

  await rest.post(
    Routes.interactionCallback(interaction.id, interaction.token),
    {
      body: {
        type: 4,
        data: {
          content: "I'm looking into it...",
        },
      },
    },
  );
}

async function handlePoliciesCommand(
  interaction: APIChatInputApplicationCommandInteraction,
) {
  const query = interaction.data.options?.find(
    (option: { name: string; type: number }) => option.name === "query" && option.type === 3,
  ) as { value: string } | undefined;
  if (!query?.value) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Veuillez fournir une recherche",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }

  await rest.post(
    Routes.interactionCallback(interaction.id, interaction.token),
    {
      body: {
        type: 4,
        data: {
          content: "I'm looking into it...",
        },
      },
    },
  );
}

async function handleAskCommand(
  interaction: APIChatInputApplicationCommandInteraction,
) {
  const message = interaction.data.options?.find(
    (option: { name: string; type: number }) => option.name === "message" && option.type === 3,
  ) as { value: string } | undefined;
  if (!message?.value) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Veuillez fournir un message.",
            flags: 64, // Ephemeral
          },
        },
      },
    );

    return NextResponse.json({success: true}, {status: 200});
  }

  const userDiscordId = interaction.user?.id ?? interaction.member?.user?.id;
  if (!userDiscordId) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content: "Impossible de récupérer votre ID Discord.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }
  if (!aiAllowedDiscordIds.includes(userDiscordId)) {
    await rest.post(
      Routes.interactionCallback(interaction.id, interaction.token),
      {
        body: {
          type: 4,
          data: {
            content:
              "Votre compte Discord n'est pas autorisé à utiliser cette commande en langage naturel.",
            flags: 64, // Ephemeral
          },
        },
      },
    );
    return NextResponse.json({success: true}, {status: 200});
  }

  await rest.post(
    Routes.interactionCallback(interaction.id, interaction.token),
    {
      body: {
        type: 4,
        data: {
          content: "I'm looking into it...",
        },
      },
    },
  );

  const responseRaw = await fetch(
    `${process.env.BREIGN_ENDPOINT}/agents/${agentId}/prompts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": process.env.BREIGN_API_KEY ?? "",
      },
      body: JSON.stringify({
        message: message.value,
        lang: "auto",
      }),
    },
  );
  const response = await responseRaw.json();

  await rest.patch(
    Routes.webhookMessage(
      interaction.application_id,
      interaction.token,
      "@original",
    ),
    {
      body: {
        content: response.text,
      },
    },
  );

  return NextResponse.json({success: true}, {status: 200});
}