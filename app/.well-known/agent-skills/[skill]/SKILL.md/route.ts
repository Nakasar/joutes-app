import { buildSkillDocument } from "@/lib/well-known/agent-skills";
import { AUTH_MD_MEDIA_TYPE } from "@/lib/well-known/auth-md";

/**
 * Le document d'une compétence. Un nom inconnu répond 404 plutôt qu'un
 * document vide en 200 : un agent qui recopierait ce vide croirait tenir une
 * compétence.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ skill: string }> }
) {
  const { skill } = await params;
  const document = buildSkillDocument(skill, new URL(request.url).origin);

  if (!document) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain" } });
  }

  return new Response(document, {
    headers: {
      "Content-Type": AUTH_MD_MEDIA_TYPE,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
