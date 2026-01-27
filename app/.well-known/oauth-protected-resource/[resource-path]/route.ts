import { serverClient } from "../../../../lib/server-client";

export const GET = async () => {
  const metadata = await serverClient.getProtectedResourceMetadata({
    resource: "https://www.joutes.app/", // `aud` claim
    authorization_servers: ["https://www.joutes.app"],
  });

  return new Response(JSON.stringify(metadata), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control":
        "public, max-age=15, stale-while-revalidate=15, stale-if-error=86400",
    },
  });
};