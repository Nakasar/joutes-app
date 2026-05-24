import {NextRequest, NextResponse} from "next/server";
import {auth} from "@/lib/auth";
import {headers} from "next/headers";
import db from "@/lib/mongodb";
import {Game} from "@/lib/types/Game";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const games = await db.collection<Game>("games").find({}, {
    projection: {
      name: 1,
      id: 1,
      slug: 1,
      description: 1,
      icon: 1,
      banner: 1,
      type: 1,
    },
  }).limit(25).toArray();

  return NextResponse.json(games);
}
