'use server';

import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/middleware/admin";
import { headers } from "next/headers";

export async function setupOAuthClientAction() {
    await requireAdmin();

    await auth.api.createOAuthClient({
        headers: await headers(),
        body: {
            redirect_uris: [process.env.NEXT_PUBLIC_URL || "http://localhost:3000/oauth/callback"],
        }
    });
}