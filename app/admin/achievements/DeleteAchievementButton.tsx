"use client";

import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { deleteAchievementAction } from "./actions";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function DeleteAchievementButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleDelete = async () => {
    if (confirm("Êtes-vous sûr de vouloir supprimer ce succès ?")) {
      startTransition(async () => {
        await deleteAchievementAction(id);
        router.refresh();
      });
    }
  };

  return (
    <Button
      variant="destructive"
      size="sm"
      onClick={handleDelete}
      disabled={isPending}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

