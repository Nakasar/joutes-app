import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getCollectionOverview } from "@/lib/db/collection";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeEmpty = request.nextUrl.searchParams.get("includeEmpty") === "true";

  try {
    const overview = await getCollectionOverview(session.user.id, { includeEmpty });
    return NextResponse.json(overview);
  } catch (error) {
    console.error("Error building collection overview:", error);
    return NextResponse.json({ error: "Failed to build collection overview" }, { status: 500 });
  }
}
