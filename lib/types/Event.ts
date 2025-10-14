export type Event = {
  id: string;
  lairId: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  price?: number;
  status: 'available' | 'sold-out' | 'cancelled';
};
