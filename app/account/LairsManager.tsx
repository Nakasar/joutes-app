"use client";

import { Lair } from "@/lib/types/Lair";
import { useState, useTransition } from "react";
import { removeLairFromUserList } from "./actions";
import Link from "next/link";

interface LairsManagerProps {
  userLairs: Lair[];
}

export default function LairsManager({ userLairs }: LairsManagerProps) {
  const [followedLairs, setFollowedLairs] = useState<Lair[]>(userLairs);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleRemoveLair = (lairId: string) => {
    startTransition(async () => {
      const result = await removeLairFromUserList(lairId);
      if (result.success) {
        setFollowedLairs(followedLairs.filter(l => l.id !== lairId));
        setError(null);
      } else {
        setError(result.error || "Erreur lors de la suppression du lieu");
      }
    });
  };

  return (
    <div>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {followedLairs.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Vous ne suivez aucun lieu pour le moment.</p>
          <p className="text-sm mt-2">
            Visitez la{" "}
            <Link href="/lairs" className="text-blue-500 hover:underline">
              liste des lieux
            </Link>{" "}
            pour en suivre !
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {followedLairs.map((lair) => (
            <div
              key={lair.id}
              className="border rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex-1">
                <Link
                  href={`/lairs/${lair.id}`}
                  className="font-semibold text-lg text-blue-600 hover:underline"
                >
                  {lair.name}
                </Link>
                <p className="text-sm text-gray-600 mt-1">
                  {lair.games.length} jeu(x) disponible(s)
                </p>
              </div>
              <button
                onClick={() => handleRemoveLair(lair.id)}
                disabled={isPending}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Ne plus suivre
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-600">
        <p>
          Pour suivre de nouveaux lieux, visitez la{" "}
          <Link href="/lairs" className="text-blue-500 hover:underline font-semibold">
            page des lieux
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
