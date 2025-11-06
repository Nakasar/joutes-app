export type ApiKey = {
  id: string;
  userId: string;
  name: string;
  description?: string;
  key: string; // La clé API générée (hachée en base)
  keyPrefix: string; // Préfixe visible pour l'utilisateur (ex: "jts_abc123...")
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
};

export type CreateApiKeyRequest = {
  name: string;
  description?: string;
};

export type UpdateApiKeyRequest = {
  name?: string;
  description?: string;
  isActive?: boolean;
};