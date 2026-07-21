"use client";

import { useState, useTransition } from "react";
import { deleteGameExportAction } from "./actions";
import { useRouter } from "next/navigation";

export function DeleteExportButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet export ?")) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteGameExportAction(id);
      if (!result.success) {
        setError(result.error || "Erreur lors de la suppression de l'export");
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-red-600 hover:text-red-900 disabled:opacity-50"
      >
        Supprimer
      </button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </>
  );
}
