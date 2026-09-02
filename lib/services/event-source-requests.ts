import "server-only";
import { Resend } from "resend";
import { isWebUrl } from "@/lib/schemas/lair.schema";

/**
 * Les courriels autour d'une demande d'aide à la connexion d'un site.
 *
 * Deux messages : l'équipe apprend qu'un gérant a besoin d'elle, le gérant
 * apprend que sa page est prête. Sans clé Resend — en local, en test —, rien
 * ne part et la demande n'en est pas moins enregistrée : c'est la fiche
 * d'administration qui fait foi, le courriel n'est qu'un rappel.
 */

export const TEAM_CONTACT_EMAIL = "contact@joutes.app";

function sender(): string {
  return process.env.EMAIL_FROM || "onboarding@resend.dev";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function send(message: { to: string; subject: string; html: string; replyTo?: string }): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;

  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    await resend.emails.send({ from: sender(), ...message });
  } catch (error) {
    console.error("Envoi du courriel impossible :", error);
  }
}

/** Prévient l'équipe qu'un gérant demande la connexion de son site. */
export async function notifyTeamOfSourceRequest(input: {
  lairId: string;
  lairName: string;
  url?: string;
  note?: string;
  requesterEmail?: string;
  appUrl: string;
}): Promise<void> {
  const lines = [
    `<p><strong>${escapeHtml(input.lairName)}</strong> demande la connexion de son site.</p>`,
    // Un lien seulement pour une adresse web : le texte vient du gérant, et
    // un `javascript:` ou un `data:` reste cliquable dans bien des clients.
    input.url
      ? isWebUrl(input.url)
        ? `<p>Page : <a href="${escapeHtml(input.url)}">${escapeHtml(input.url)}</a></p>`
        : `<p>Page : ${escapeHtml(input.url)}</p>`
      : "",
    input.note ? `<p>Mot du gérant :</p><blockquote>${escapeHtml(input.note)}</blockquote>` : "",
    input.requesterEmail ? `<p>Demandé par ${escapeHtml(input.requesterEmail)}.</p>` : "",
    `<p><a href="${escapeHtml(`${input.appUrl}/admin/lairs/${input.lairId}?tab=sources`)}">Configurer la source</a></p>`,
  ];

  await send({
    to: TEAM_CONTACT_EMAIL,
    subject: `Connexion d'un site : ${input.lairName}`,
    html: lines.filter(Boolean).join("\n"),
    ...(input.requesterEmail ? { replyTo: input.requesterEmail } : {}),
  });
}

/** Prévient le gérant que l'équipe a connecté sa page. */
export async function notifyManagerSourceReady(input: {
  to: string;
  lairId: string;
  lairName: string;
  appUrl: string;
}): Promise<void> {
  await send({
    to: input.to,
    subject: `Vos événements sont connectés - ${input.lairName}`,
    html: [
      `<p>Bonne nouvelle : l'équipe Joutes a connecté le site de <strong>${escapeHtml(input.lairName)}</strong>.</p>`,
      `<p>Vos événements apparaissent maintenant sur votre vitrine et se mettront à jour tout seuls.</p>`,
      `<p><a href="${escapeHtml(`${input.appUrl}/lairs/${input.lairId}/manage?tab=events`)}">Voir l'état de la connexion</a></p>`,
      `<p>Une question ? Répondez à ce message ou écrivez à ${TEAM_CONTACT_EMAIL}.</p>`,
    ].join("\n"),
    replyTo: TEAM_CONTACT_EMAIL,
  });
}
