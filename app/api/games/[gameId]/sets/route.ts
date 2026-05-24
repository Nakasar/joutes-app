import {NextResponse} from "next/server";
import sets from '@/data/riftbound/sets.json';

export async function GET() {
  return NextResponse.json(sets);
}