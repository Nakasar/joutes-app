import { buildSkillsIndex } from "@/lib/well-known/agent-skills";

/**
 * L'index des compétences publiées (Agent Skills Discovery v0.2.0). Les
 * empreintes sont calculées sur les documents que sert la route voisine, à la
 * même origine : ce qui est annoncé est ce qui sera téléchargé.
 */
export async function GET(request: Request) {
  const index = buildSkillsIndex(new URL(request.url).origin);

  return new Response(JSON.stringify(index, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
