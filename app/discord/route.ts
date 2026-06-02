import {REST} from "@discordjs/rest";
import {
  APIChatInputApplicationCommandInteraction,
  InteractionType,
  Routes,
} from "discord-api-types/v10";
import {verify} from "discord-verify/node";
import {NextResponse} from "next/server";
import crypto from "node:crypto";
import db from "@/lib/mongodb";
import {BoosterCard} from "@/lib/types/booster";
import {EmbedBuilder} from "@discordjs/builders";
import { getErratasByCardId } from "@/lib/db/erratas";
import { Game } from "@/lib/types/Game";

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

  }

  return NextResponse.json({success: true}, {status: 200});
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
    case "policies":
      return handlePoliciesCommand(body);
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