import { buildRobotsTxt } from "@/lib/well-known/robots";

export function GET() {
  return new Response(buildRobotsTxt(), {
    headers: {
      'Content-Type': 'text/plain',
    },
  });
}
