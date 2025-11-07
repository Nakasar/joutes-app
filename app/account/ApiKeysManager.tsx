"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from "@/components/ui/dialog";
import { createUserApiKey, revokeUserApiKey, getUserApiKeysAction } from "./api-keys-actions";
import { ApiKey } from "@/lib/types/ApiKey";
import { Copy, Plus, Trash2, Key, Eye, EyeOff } from "lucide-react";

export default function ApiKeysManager() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingKeys, setDeletingKeys] = useState<Set<string>>(new Set());

  // Charger les clés API au montage du composant
  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getUserApiKeysAction();
      
      if (result.success && result.apiKeys) {
        setApiKeys(result.apiKeys);
      } else {
        setError(result.error || "Erreur lors du chargement des clés API");
      }
    } catch (err) {
      setError("Erreur lors du chargement des clés API");
      console.error("Erreur:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) {
      setError("Le nom de la clé est requis");
      return;
    }

    try {
      setCreatingKey(true);
      setError(null);
      
      const result = await createUserApiKey(newKeyName.trim());
      
      if (result.success && result.apiKey) {
        setNewApiKey(result.apiKey);
        setShowNewKey(true);
        setNewKeyName("");
        setShowCreateDialog(false);
        await loadApiKeys(); // Recharger la liste
      } else {
        setError(result.error || "Erreur lors de la création de la clé API");
      }
    } catch (err) {
      setError("Erreur lors de la création de la clé API");
      console.error("Erreur:", err);
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeApiKey = async (keyId: string, keyName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir révoquer la clé "${keyName}" ? Cette action est irréversible.`)) {
      return;
    }

    try {
      setDeletingKeys(prev => new Set(prev).add(keyId));
      setError(null);
      
      const result = await revokeUserApiKey(keyId);
      
      if (result.success) {
        await loadApiKeys(); // Recharger la liste
      } else {
        setError(result.error || "Erreur lors de la révocation de la clé API");
      }
    } catch (err) {
      setError("Erreur lors de la révocation de la clé API");
      console.error("Erreur:", err);
    } finally {
      setDeletingKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(keyId);
        return newSet;
      });
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Optionnel: Ajouter une notification de succès
    } catch (err) {
      console.error("Erreur lors de la copie:", err);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit", 
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const formatKeyForDisplay = (keyPrefix: string) => {
    return `${keyPrefix}••••••••••••••••••••••••`;
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p>Chargement des clés API...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Clés API
              </CardTitle>
              <CardDescription>
                Gérez vos clés API pour accéder au serveur MCP de Joutes. 
                Les clés API permettent d&apos;utiliser les fonctionnalités de la plateforme via des intégrations externes.
              </CardDescription>
            </div>
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvelle clé
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Créer une nouvelle clé API</DialogTitle>
                  <DialogDescription>
                    Donnez un nom descriptif à votre clé API pour l&apos;identifier facilement.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="keyName" className="text-sm font-medium">
                      Nom de la clé
                    </label>
                    <Input
                      id="keyName"
                      placeholder="Ex: Mon intégration MCP"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      disabled={creatingKey}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateDialog(false)}
                    disabled={creatingKey}
                  >
                    Annuler
                  </Button>
                  <Button onClick={handleCreateApiKey} disabled={creatingKey || !newKeyName.trim()}>
                    {creatingKey ? "Création..." : "Créer"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Affichage de la nouvelle clé créée */}
          {newApiKey && showNewKey && (
            <Alert className="mb-4">
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">Votre nouvelle clé API a été créée :</p>
                  <div className="flex items-center gap-2 p-2 bg-gray-50 rounded border font-mono text-sm">
                    <span className="flex-1 break-all">{newApiKey}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyToClipboard(newApiKey)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    ⚠️ Copiez cette clé maintenant, elle ne sera plus affichée.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setNewApiKey(null);
                      setShowNewKey(false);
                    }}
                  >
                    J&apos;ai copié la clé
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {apiKeys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Aucune clé API créée</p>
              <p className="text-sm">Créez votre première clé pour commencer à utiliser l&apos;API MCP.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {apiKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium">{key.name}</h4>
                      <Badge variant={key.isActive ? "default" : "secondary"}>
                        {key.isActive ? "Actif" : "Inactif"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div className="font-mono">
                        {formatKeyForDisplay(key.keyPrefix)}
                      </div>
                      <div>
                        Créé le {formatDate(key.createdAt)}
                        {key.lastUsedAt && (
                          <span> • Dernière utilisation : {formatDate(key.lastUsedAt)}</span>
                        )}
                        {key.usageCount > 0 && (
                          <span> • {key.usageCount} utilisation(s)</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(key.keyPrefix)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevokeApiKey(key.id, key.name)}
                      disabled={deletingKeys.has(key.id)}
                    >
                      {deletingKeys.has(key.id) ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentation MCP */}
      <Card>
        <CardHeader>
          <CardTitle>Utilisation de l&apos;API MCP</CardTitle>
          <CardDescription>
            Comment utiliser vos clés API avec le serveur MCP de Joutes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Endpoint MCP</h4>
            <code className="block p-2 bg-gray-50 rounded border text-sm">
              {process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/mcp
            </code>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Authentification</h4>
            <p className="text-sm text-muted-foreground mb-2">
              Ajoutez votre clé API dans l&apos;en-tête Authorization :
            </p>
            <code className="block p-2 bg-gray-50 rounded border text-sm">
              Authorization: Bearer votre_clé_api
            </code>
          </div>

          <div>
            <h4 className="font-medium mb-2">Outils disponibles</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>search_events</strong> : Rechercher des évènements (avec personnalisation)</li>
              <li>• <strong>search_lairs</strong> : Rechercher des lieux</li>
              <li>• <strong>create_event</strong> : Créer un évènement (auth requise)</li>
              <li>• <strong>follow_lair</strong> : Suivre un lieu (auth requise)</li>
              <li>• <strong>add_game</strong> : Ajouter un jeu (auth requise)</li>
              <li>• <strong>list_games</strong> : Lister les jeux disponibles</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}