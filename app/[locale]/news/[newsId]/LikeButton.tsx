"use client";

import { useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

type LikeButtonProps = {
  newsId: string;
  initialLiked: boolean;
  initialCount: number;
  isLoggedIn: boolean;
};

export default function LikeButton({ newsId, initialLiked, initialCount, isLoggedIn }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [isLoading, setIsLoading] = useState(false);

  const handleLike = async () => {
    if (!isLoggedIn) {
      toast.error("Vous devez être connecté pour aimer une actualité");
      return;
    }
    if (isLoading) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/news/${newsId}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
      const data: { liked: boolean; likesCount: number } = await res.json();
      setLiked(data.liked);
      setCount(data.likesCount);
    } catch {
      toast.error("Erreur lors du like");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      onClick={handleLike}
      disabled={isLoading}
      className="flex items-center gap-2 px-4 py-2 rounded-full border hover:bg-accent transition-colors disabled:opacity-50"
    >
      <Heart
        className={`h-5 w-5 transition-colors ${liked ? "fill-red-500 text-red-500" : "text-muted-foreground"}`}
      />
      <span className="text-sm font-medium">{count}</span>
      <span className="text-sm text-muted-foreground">{liked ? "J'aime" : "J'aime"}</span>
    </button>
  );
}
