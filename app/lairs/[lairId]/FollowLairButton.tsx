"use client";

import { useState, useTransition } from "react";
import { addLairToUserList, removeLairFromUserList } from "@/app/account/actions";
import { useRouter } from "next/navigation";

interface FollowLairButtonProps {
  lairId: string;
  isFollowing: boolean;
  isAuthenticated: boolean;
}

export default function FollowLairButton({ 
  lairId, 
  isFollowing: initialIsFollowing,
  isAuthenticated 
}: FollowLairButtonProps) {
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!isAuthenticated) {
    return null;
  }

  const handleToggleFollow = () => {
    startTransition(async () => {
      if (isFollowing) {
        const result = await removeLairFromUserList(lairId);
        if (result.success) {
          setIsFollowing(false);
          setError(null);
          router.refresh();
        } else {
          setError(result.error || "Erreur");
        }
      } else {
        const result = await addLairToUserList(lairId);
        if (result.success) {
          setIsFollowing(true);
          setError(null);
          router.refresh();
        } else {
          setError(result.error || "Erreur");
        }
      }
    });
  };

  return (
    <div>
      {error && (
        <div className="mb-2 text-sm text-red-600">
          {error}
        </div>
      )}
      <button
        onClick={handleToggleFollow}
        disabled={isPending}
        className={`px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          isFollowing
            ? "bg-gray-200 text-gray-800 hover:bg-gray-300"
            : "bg-blue-500 text-white hover:bg-blue-600"
        }`}
      >
        {isPending ? "..." : isFollowing ? "NE PLUS SUIVRE" : "SUIVRE"}
      </button>
    </div>
  );
}
