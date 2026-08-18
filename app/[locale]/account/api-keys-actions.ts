"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createApiKey, getUserApiKeys, revokeApiKey } from "@/lib/db/api-keys";
import { redirect } from "next/navigation";
import { ApiKey } from "@/lib/types/ApiKey";

export async function createUserApiKey(name: string): Promise<{ success: boolean; apiKey?: string; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    if (!name.trim()) {
      return { success: false, error: "Le nom de la clé API est requis" };
    }

    const result = await createApiKey(session.user.id, name.trim());
    
    return { 
      success: true, 
      apiKey: result.plainKey 
    };
  } catch (error) {
    console.error("Erreur lors de la création de la clé API:", error);
    return { success: false, error: "Erreur lors de la création de la clé API" };
  }
}

export async function revokeUserApiKey(keyId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session?.user?.id) {
      return { success: false, error: "Non authentifié" };
    }

    const success = await revokeApiKey(keyId, session.user.id);
    
    if (!success) {
      return { success: false, error: "Clé API non trouvée ou vous n'êtes pas autorisé" };
    }

    return { success: true };
  } catch (error) {
    console.error("Erreur lors de la révocation de la clé API:", error);
    return { success: false, error: "Erreur lors de la révocation de la clé API" };
  }
}

export async function getUserApiKeysAction(): Promise<{ success: boolean; apiKeys?: ApiKey[]; error?: string }> {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    
    if (!session?.user?.id) {
      redirect("/login");
    }

    const apiKeys = await getUserApiKeys(session.user.id);
    
    return { success: true, apiKeys };
  } catch (error) {
    console.error("Erreur lors de la récupération des clés API:", error);
    return { success: false, error: "Erreur lors de la récupération des clés API" };
  }
}
