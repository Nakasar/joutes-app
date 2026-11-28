import { CRAWLER_CACHE_CONTROL } from "@/lib/net/crawler-cache";
import { buildRobotsTxt } from "@/lib/well-known/robots";

export function GET() {
  return new Response(buildRobotsTxt(), {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': CRAWLER_CACHE_CONTROL,
    },
  });
}
