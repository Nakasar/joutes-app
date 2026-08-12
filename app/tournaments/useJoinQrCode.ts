"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Lien de participation d'un tournoi (`/t/:code/join`) et son QR code en data
 * URL. Les deux ne sont calculés qu'au montage : l'origine n'existe pas au
 * rendu serveur, et un lien absolu rendu à vide côté serveur puis rempli côté
 * client casserait l'hydratation.
 */
export function useJoinQrCode(code: string): { joinUrl: string; qrCodeUrl: string } {
  const [joinUrl, setJoinUrl] = useState("");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  useEffect(() => {
    if (!code) return;
    const url = `${window.location.origin}/t/${code}/join`;
    setJoinUrl(url);
    QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: "#000000", light: "#FFFFFF" } })
      .then(setQrCodeUrl)
      .catch((err) => console.error("Erreur lors de la génération du QR code:", err));
  }, [code]);

  return { joinUrl, qrCodeUrl };
}
