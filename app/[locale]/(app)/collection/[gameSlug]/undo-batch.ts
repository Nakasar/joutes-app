import { toast } from "sonner";

/**
 * Retire un lot d'exemplaires qu'on vient d'ajouter (extension, import) : le
 * bouton « Annuler » de la notification qui annonce l'ajout.
 */
export async function undoBatch(batchId: string, doneLabel: (removed: number) => string, errorLabel: string): Promise<void> {
  try {
    const response = await fetch(`/api/collection/batches/${encodeURIComponent(batchId)}`, { method: "DELETE" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { removed } = (await response.json()) as { removed: number };
    toast.success(doneLabel(removed));
  } catch (error) {
    console.error("Error undoing collection batch:", error);
    toast.error(errorLabel);
  }
}
