"use client";

import { useTransition } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { PolicyVoteType } from "@/lib/types/policies";
import { votePolicy } from "@/app/games/[gameSlugOrId]/policies/actions";

export default function PolicyVoteButtons({
  policyId,
  gameSlug,
  votes,
  userCanVote,
}: {
  policyId: string;
  gameSlug: string;
  votes: { positive: number; negative: number; userVote?: PolicyVoteType };
  userCanVote: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  const handleVote = (vote: PolicyVoteType) => {
    startTransition(async () => {
      await votePolicy(policyId, gameSlug, vote);
    });
  };

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={!userCanVote || isPending}
        onClick={() => handleVote("positive")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          votes.userVote === "positive"
            ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            : "bg-muted text-muted-foreground hover:bg-green-50 hover:text-green-700 dark:hover:bg-green-950 dark:hover:text-green-300"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={
          !userCanVote
            ? "Vous n'avez pas la permission de voter"
            : votes.userVote === "positive"
            ? "Retirer mon vote positif"
            : "Voter positivement"
        }
      >
        <ThumbsUp className="h-4 w-4" />
        <span>{votes.positive}</span>
      </button>
      <button
        disabled={!userCanVote || isPending}
        onClick={() => handleVote("negative")}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
          votes.userVote === "negative"
            ? "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300"
            : "bg-muted text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-300"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={
          !userCanVote
            ? "Vous n'avez pas la permission de voter"
            : votes.userVote === "negative"
            ? "Retirer mon vote négatif"
            : "Voter négativement"
        }
      >
        <ThumbsDown className="h-4 w-4" />
        <span>{votes.negative}</span>
      </button>
    </div>
  );
}

