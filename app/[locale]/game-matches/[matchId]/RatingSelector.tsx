"use client";

import { Angry, Frown, Meh, Smile, Laugh } from "lucide-react";
import { Button } from "@/components/ui/button";

type RatingSelectorProps = {
  value?: 1 | 2 | 3 | 4 | 5;
  onChange: (rating: 1 | 2 | 3 | 4 | 5) => void;
  disabled?: boolean;
};

const ratings = [
  { value: 1 as const, icon: Angry, label: "En colère", color: "text-red-500" },
  { value: 2 as const, icon: Frown, label: "Triste", color: "text-orange-500" },
  { value: 3 as const, icon: Meh, label: "Neutre", color: "text-yellow-500" },
  { value: 4 as const, icon: Smile, label: "Content", color: "text-green-500" },
  { value: 5 as const, icon: Laugh, label: "Grand sourire", color: "text-emerald-500" },
];

export default function RatingSelector({ value, onChange, disabled }: RatingSelectorProps) {
  return (
    <div className="flex gap-2">
      {ratings.map(({ value: ratingValue, icon: Icon, label, color }) => {
        const isSelected = value === ratingValue;
        return (
          <Button
            key={ratingValue}
            type="button"
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={() => onChange(ratingValue)}
            disabled={disabled}
            className={`gap-2 ${isSelected ? "" : "hover:" + color}`}
            title={label}
          >
            <Icon className={`h-4 w-4 ${isSelected ? "" : color}`} />
          </Button>
        );
      })}
    </div>
  );
}
