import { NextRequest } from "next/server";
import { validateApiKey } from "@/lib/db/api-keys";

export type AuthenticatedRequest = NextRequest & {
  userId: string;
  apiKeyId: string;
};

/**
 * Middleware pour valider les clés API dans les requêtes MCP
 */
export async function validateApiKeyMiddleware(
  request: NextRequest
): Promise<{ userId: string; apiKeyId: string } | { error: string; status: number }> {
  // Récupérer la clé API depuis l'en-tête Authorization
  const authHeader = request.headers.get("authorization");
  
  if (!authHeader) {
    return {
      error: "En-tête Authorization manquant",
      status: 401
    };
  }
  
  // Vérifier le format Bearer token
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return {
      error: "Format d'autorisation invalide. Utilisez 'Bearer <api_key>'",
      status: 401
    };
  }
  
  const apiKey = parts[1];
  
  if (!apiKey) {
    return {
      error: "Clé API manquante",
      status: 401
    };
  }
  
  // Valider la clé API
  try {
    const validation = await validateApiKey(apiKey);
    
    if (!validation) {
      return {
        error: "Clé API invalide ou inactive",
        status: 401
      };
    }
    
    return {
      userId: validation.userId,
      apiKeyId: validation.apiKeyId
    };
  } catch (error) {
    console.error("Erreur lors de la validation de la clé API:", error);
    return {
      error: "Erreur interne du serveur",
      status: 500
    };
  }
}

/**
 * Extraire la clé API depuis les paramètres de requête (fallback)
 */
export function extractApiKeyFromQuery(request: NextRequest): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("api_key");
}

/**
 * Valider une clé API avec support pour header et query parameter
 */
export async function validateApiKeyFromRequest(
  request: NextRequest
): Promise<{ userId: string; apiKeyId: string } | { error: string; status: number }> {
  // D'abord essayer l'en-tête Authorization
  let authResult = await validateApiKeyMiddleware(request);
  
  // Si pas d'en-tête Authorization, essayer le paramètre de requête
  if ("error" in authResult && authResult.status === 401) {
    const apiKeyFromQuery = extractApiKeyFromQuery(request);
    
    if (apiKeyFromQuery) {
      try {
        const validation = await validateApiKey(apiKeyFromQuery);
        
        if (!validation) {
          return {
            error: "Clé API invalide ou inactive",
            status: 401
          };
        }
        
        return {
          userId: validation.userId,
          apiKeyId: validation.apiKeyId
        };
      } catch (error) {
        console.error("Erreur lors de la validation de la clé API depuis la requête:", error);
        return {
          error: "Erreur interne du serveur",
          status: 500
        };
      }
    }
  }
  
  return authResult;
}