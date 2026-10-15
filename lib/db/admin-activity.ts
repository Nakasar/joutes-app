import { type Document, ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import {
  type ActivityPeriod,
  type ActivitySeries,
  activityWindow,
  summarizeActivity,
} from "@/lib/admin/activity.ts";

export type AdminActivity = {
  newUsers: ActivitySeries;
  events: ActivitySeries;
  tournaments: ActivitySeries;
  decks: ActivitySeries;
};

/**
 * L'activité de la plateforme sur la période et sur celle d'avant : nouveaux
 * comptes, évènements ajoutés (importés compris), tournois créés et decks
 * partagés (publics ou non répertoriés).
 *
 * On ne lit que les dates, projetées seules, sur deux périodes au plus
 * (soixante jours) : chaque lecture passe par un index sur sa date ou par
 * l'`_id` pour les évènements, qui n'ont pas de date de création.
 */
export async function getAdminActivity(period: ActivityPeriod, now = new Date()): Promise<AdminActivity> {
  const window = activityWindow(period, now);
  const since = window.previousStart;

  const [users, events, tournaments, decks] = await Promise.all([
    db
      .collection("user")
      .find({ createdAt: { $gte: since } }, { projection: { _id: 0, createdAt: 1 } })
      .toArray(),
    db
      .collection("events")
      .find(
        { _id: { $gte: ObjectId.createFromTime(Math.floor(since.getTime() / 1000)) } },
        { projection: { _id: 1 } }
      )
      .toArray(),
    db
      .collection("tournaments")
      .find({ createdAt: { $gte: since } }, { projection: { _id: 0, createdAt: 1 } })
      .toArray(),
    db
      .collection("decks")
      .find(
        { visibility: { $in: ["public", "unlisted"] }, createdAt: { $gte: since } },
        { projection: { _id: 0, createdAt: 1 } }
      )
      .toArray(),
  ]);

  const dates = (docs: Document[]) =>
    docs.flatMap((doc) => {
      const date = doc.createdAt instanceof Date ? doc.createdAt : new Date(String(doc.createdAt));
      return Number.isNaN(date.getTime()) ? [] : [date];
    });

  return {
    newUsers: summarizeActivity(dates(users), window),
    events: summarizeActivity(
      events.flatMap((doc) => (doc._id instanceof ObjectId ? [doc._id.getTimestamp()] : [])),
      window
    ),
    tournaments: summarizeActivity(dates(tournaments), window),
    decks: summarizeActivity(dates(decks), window),
  };
}
