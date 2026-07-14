import { buildOgImage } from "@/lib/og";

export const dynamic = "force-dynamic";

export const alt = "Documentation pour intégrations - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return buildOgImage({
    title: "Intégrations développeurs",
    subtitle: "Discord, API REST et serveur MCP pour connecter vos outils et agents IA à Joutes.",
    variant: "integrations",
  });
}
