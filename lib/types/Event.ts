export type Event = {
  id: string;
  lairId: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  url?: string;
  price?: number;
  status: 'available' | 'sold-out' | 'cancelled';
  addedBy: string; // ID de l'utilisateur qui a créé l'événement ou "AI-SCRAPPING"
};
