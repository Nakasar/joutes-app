import { ShoppingCart } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import type { DeckCardnexusOrder } from "@/lib/decks/cardnexus-order.ts";

/**
 * « Acheter le deck sur CardNexus » : un lien, pas une action — le panier
 * s'ouvre chez CardNexus, dans un autre onglet, par le lien affilié de Joutes
 * (cf. `lib/decks/cardnexus-order.ts`). Rien n'est affiché quand aucune carte
 * n'a de produit là-bas : un bouton vers un panier vide n'aide personne.
 */
export function BuyDeckOnCardnexusButton({
  order,
  className,
}: {
  order: DeckCardnexusOrder;
  className?: string;
}) {
  if (!order.url) {
    return null;
  }

  return (
    <Button asChild variant="outline" className={cn("gap-1.5", className)}>
      <a href={order.url} target="_blank" rel="noopener noreferrer sponsored">
        <ShoppingCart />
        Acheter le deck sur CardNexus
      </a>
    </Button>
  );
}

/**
 * Ce que le panier couvre, et que le lien est affilié : une mention qu'on lit
 * sans survoler, un téléphone n'ayant pas de survol.
 */
export function BuyDeckOnCardnexusHint({
  order,
  className,
}: {
  order: DeckCardnexusOrder;
  className?: string;
}) {
  if (!order.url) {
    return null;
  }

  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {order.matched} carte{order.matched > 1 ? "s" : ""} sur {order.total} du deck disponible
      {order.matched > 1 ? "s" : ""} sur CardNexus. Lien affilié : Joutes touche une commission sur vos achats,
      sans surcoût pour vous.
    </p>
  );
}
