import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Icône d'un succès : image carrée importée si disponible, sinon repli sur
 * l'emoji hérité. `size` est la taille (px) du carré ou de l'emoji.
 */
export function AchievementIcon({
  icon,
  iconImage,
  name,
  size = 40,
  className,
}: {
  icon?: string;
  iconImage?: string;
  name?: string;
  size?: number;
  className?: string;
}) {
  if (iconImage) {
    return (
      <Image
        src={iconImage}
        alt={name ?? "Succès"}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={cn("rounded object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn("inline-flex items-center justify-center leading-none", className)}
      style={{ fontSize: Math.round(size * 0.8), width: size, height: size }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}
