"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

const EMPTY = { joinUrl: "", qrCodeUrl: "" };

/**
 * Lien de participation d'un tournoi (`/t/:code/join`) et son QR code en data
 * URL. Les deux ne sont calculés qu'au montage : l'origine n'existe pas au
 * rendu serveur, et un lien absolu rendu à vide côté serveur puis rempli côté
 * client casserait l'hydratation. Le lien est posé sans attendre le QR code,
 * qui met un aller-retour de plus à se dessiner.
 */
export function useJoinQrCode(code: string): { joinUrl: string; qrCodeUrl: string } {
  const [state, setState] = useState(EMPTY);

  useEffect(() => {
    if (!code) {
      // Plus de code : ce qui était affiché ne vaut plus rien.
      setState(EMPTY);
      return;
    }
    let current = true;
    const joinUrl = `${window.location.origin}/t/${code}/join`;
    setState({ joinUrl, qrCodeUrl: "" });
    QRCode.toDataURL(joinUrl, { width: 240, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then((qrCodeUrl) => {
        if (current) setState({ joinUrl, qrCodeUrl });
      })
      .catch((err) => console.error("Erreur lors de la génération du QR code:", err));
    // Un dessin arrivé en retard ne doit pas coller le QR code d'un code au
    // suivant : passé le changement, sa réponse est ignorée.
    return () => {
      current = false;
    };
  }, [code]);

  return state;
}
