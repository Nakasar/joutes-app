import * as React from "react";
import { Body, Column, Container, Head, Html, Img, Link, Preview, Row, Section, Text } from "react-email";
import { DateTime } from "luxon";

import {
  friendNames,
  weeklyEmailIntro,
  WEEKLY_EMAIL_ZONE,
  type DigestEvent,
  type DigestFriend,
  type WeeklyEmailContent,
} from "@/lib/notifications/weekly-email";

/**
 * L'email hebdomadaire, aux couleurs de Joutes (le thème sombre du site).
 *
 * Styles en ligne et tableaux (`Row`/`Column`) plutôt que classes : c'est ce
 * que les messageries lisent toutes. Maquette :
 * https://claude.ai/artifact/RtLBzFiuSTWiKLxu2T21H3
 */

const BASE_URL = "https://www.joutes.app";

const color = {
  background: "#040c13",
  card: "#0e171e",
  border: "#20303b",
  foreground: "#e8eef2",
  muted: "#b4c3cb",
  subtle: "#8ea3ae",
  primary: "#25afd2",
  onPrimary: "#04121b",
  secondary: "#0d3242",
  chip: "#9fd8ea",
  pick: "#e9b44c",
  friend: "#c9b5f7",
  good: "#8fe0c4",
  down: "#f2a07a",
};

const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const card: React.CSSProperties = {
  backgroundColor: color.card,
  border: `1px solid ${color.border}`,
  borderRadius: "12px",
};

const text = (size: number, extra: React.CSSProperties = {}): React.CSSProperties => ({
  margin: 0,
  fontFamily: font,
  fontSize: `${size}px`,
  lineHeight: 1.5,
  color: color.foreground,
  ...extra,
});

function at(iso: string): DateTime {
  return DateTime.fromISO(iso).setZone(WEEKLY_EMAIL_ZONE).setLocale("fr");
}

/** « sam. 28 nov. · 14:00 » */
function when(iso: string): string {
  const date = at(iso);
  return `${date.toFormat("ccc d LLL")} · ${date.toFormat("HH:mm")}`;
}

function url(path: string): string {
  return `${BASE_URL}${path}`;
}

function SectionTitle({ title, accent }: { title: string; accent: string }) {
  return (
    <Text style={text(19, { fontWeight: 700, marginBottom: "14px" })}>
      <span style={{ color: accent }}>●</span>&nbsp;&nbsp;{title}
    </Text>
  );
}

function Avatars({ friends }: { friends: DigestFriend[] }) {
  const palette = ["#5b3f8f", "#1f6b7d", "#8a4b2a", "#2f5d3a"];
  return (
    <span>
      {friends.slice(0, 3).map((friend, index) =>
        friend.avatar ? (
          <Img
            key={friend.id}
            src={friend.avatar}
            alt={friend.displayName}
            width="24"
            height="24"
            style={{ display: "inline-block", width: "24px", height: "24px", borderRadius: "999px", marginRight: "4px", verticalAlign: "middle" }}
          />
        ) : (
          <span
            key={friend.id}
            style={{
              display: "inline-block",
              width: "24px",
              height: "24px",
              lineHeight: "24px",
              textAlign: "center",
              borderRadius: "999px",
              marginRight: "4px",
              backgroundColor: palette[index % palette.length],
              color: color.foreground,
              fontFamily: font,
              fontSize: "11px",
              fontWeight: 700,
              verticalAlign: "middle",
            }}
          >
            {friend.displayName.slice(0, 1).toUpperCase()}
          </span>
        ),
      )}
    </span>
  );
}

function PickCard({ event }: { event: DigestEvent }) {
  const filling =
    event.maxParticipants && event.registered !== undefined
      ? `${event.registered}/${event.maxParticipants} inscrits`
      : undefined;
  return (
    <Link href={url(`/events/${event.id}`)} style={{ textDecoration: "none", display: "block" }}>
      <div style={{ ...card, overflow: "hidden" }}>
        {event.banner ? (
          <Img src={event.banner} alt="" width="270" style={{ display: "block", width: "100%", height: "96px", objectFit: "cover" }} />
        ) : (
          <div style={{ height: "96px", backgroundColor: color.secondary }} />
        )}
        <div style={{ padding: "14px" }}>
          <Text style={text(11, { color: color.pick, fontWeight: 600, marginBottom: "6px" })}>Choix du lieu</Text>
          <Text style={text(16, { fontWeight: 700 })}>{event.name}</Text>
          <Text style={text(13, { color: color.muted, marginTop: "4px" })}>{when(event.startDateTime)}</Text>
          <Text style={text(13, { color: color.muted })}>
            {[event.lair?.name, filling].filter(Boolean).join(" · ")}
          </Text>
        </div>
      </div>
    </Link>
  );
}

function DateBlock({ iso }: { iso: string }) {
  const date = at(iso);
  return (
    <div style={{ width: "52px", padding: "6px 0", textAlign: "center", backgroundColor: color.secondary, borderRadius: "8px" }}>
      <Text style={text(11, { color: color.chip, textTransform: "uppercase" })}>{date.toFormat("ccc")}</Text>
      <Text style={text(20, { fontWeight: 700, lineHeight: 1.2 })}>{date.toFormat("d")}</Text>
    </div>
  );
}

function Block({ children }: { children: React.ReactNode }) {
  return <Section style={{ marginTop: "40px" }}>{children}</Section>;
}

function ListRow({ left, right, last }: { left: React.ReactNode; right?: React.ReactNode; last?: boolean }) {
  return (
    <Row style={{ borderBottom: last ? "none" : `1px solid ${color.border}` }}>
      <Column style={{ padding: "12px 16px", verticalAlign: "middle" }}>{left}</Column>
      {right !== undefined && (
        <Column style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "right", width: "40%" }}>{right}</Column>
      )}
    </Row>
  );
}

function Action({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ fontFamily: font, fontSize: "14px", fontWeight: 600, color: color.primary, textDecoration: "none" }}>
      {children}
    </Link>
  );
}

const TREND: Record<string, { label: string; color: string }> = {
  up: { label: "en hausse", color: color.good },
  down: { label: "en baisse", color: color.down },
  stable: { label: "stable", color: color.muted },
  new: { label: "nouvelle", color: color.good },
};

function percent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

function price(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency }).format(value);
}

export type UserWeeklyEmailProps = {
  content: WeeklyEmailContent;
  subject: string;
};

export function UserWeeklyEmail({ content, subject }: UserWeeklyEmailProps) {
  const intro = weeklyEmailIntro(content);
  const weekStart = at(content.weekStart);
  const weekEnd = weekStart.plus({ days: 6 });
  const pickRows = [];
  for (let index = 0; index < content.lairPicks.length; index += 2) pickRows.push(content.lairPicks.slice(index, index + 2));

  return (
    <Html lang="fr">
      <Head>
        <title>{subject}</title>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Body style={{ margin: 0, padding: "24px 0", backgroundColor: color.background }}>
        <Preview>{intro}</Preview>
        <Container style={{ maxWidth: "640px", width: "100%", backgroundColor: color.background, padding: "16px 24px 32px" }}>
          {/* En-tête */}
          <Row>
            <Column style={{ verticalAlign: "middle" }}>
              <Link href={BASE_URL} style={{ textDecoration: "none" }}>
                <Img
                  src={url("/logo/android-chrome-192x192.png")}
                  alt=""
                  width="32"
                  height="32"
                  style={{ display: "inline-block", borderRadius: "999px", verticalAlign: "middle" }}
                />
                <span style={{ fontFamily: font, fontSize: "22px", fontWeight: 700, color: "#6aa8f0", verticalAlign: "middle", marginLeft: "10px" }}>
                  Joutes
                </span>
              </Link>
            </Column>
            <Column style={{ verticalAlign: "middle", textAlign: "right" }}>
              <Text style={text(12, { fontFamily: mono, color: color.subtle, textTransform: "uppercase", letterSpacing: "0.06em" })}>
                Semaine du {weekStart.toFormat("d")} au {weekEnd.toFormat("d LLL")}
              </Text>
            </Column>
          </Row>

          <Text style={text(30, { fontWeight: 700, lineHeight: 1.2, marginTop: "24px" })}>
            Salut {content.username}, voici ta semaine
          </Text>
          <Text style={text(15, { color: color.muted, marginTop: "10px" })}>{intro}</Text>

          {content.followsNothing && (
            <Text style={text(15, { color: color.muted, marginTop: "16px" })}>
              Tu ne suis encore aucun jeu ni aucun lieu. Explore <Link href={url("/games")} style={{ color: color.primary }}>les jeux</Link>{" "}
              et abonne-toi à <Link href={url("/lairs")} style={{ color: color.primary }}>tes lieux préférés</Link> : l&apos;email
              suivra ce qu&apos;ils proposent.
            </Text>
          )}

          {content.lairPicks.length > 0 && (
            <Block>
              <SectionTitle title="Le choix de tes lieux" accent={color.pick} />
              {pickRows.map((row, index) => (
                <Row key={index} style={{ marginBottom: "14px" }}>
                  {row.map((event, column) => (
                    <Column key={event.id} style={{ width: "50%", verticalAlign: "top", paddingLeft: column === 1 ? "7px" : 0, paddingRight: column === 0 ? "7px" : 0 }}>
                      <PickCard event={event} />
                    </Column>
                  ))}
                  {row.length === 1 && <Column style={{ width: "50%" }} />}
                </Row>
              ))}
            </Block>
          )}

          {content.friends.length > 0 && (
            <Block>
              <SectionTitle title="Tes amis y pensent" accent={color.friend} />
              {content.friends.map((event) => (
                <Link key={event.id} href={url(`/events/${event.id}`)} style={{ textDecoration: "none", display: "block", marginBottom: "10px" }}>
                  <Row style={card}>
                    <Column style={{ width: "52px", padding: "12px 0 12px 14px", verticalAlign: "middle" }}>
                      <DateBlock iso={event.startDateTime} />
                    </Column>
                    <Column style={{ padding: "12px 14px", verticalAlign: "middle" }}>
                      <Text style={text(15, { fontWeight: 600 })}>{event.name}</Text>
                      <Text style={text(13, { color: color.muted })}>
                        {[at(event.startDateTime).toFormat("HH:mm"), event.lair?.name].filter(Boolean).join(" · ")}
                      </Text>
                    </Column>
                    <Column style={{ padding: "12px 14px", verticalAlign: "middle", textAlign: "right" }}>
                      <Avatars friends={event.friends ?? []} />
                      <Text style={text(12, { color: color.friend })}>{friendNames(event.friends ?? [])}</Text>
                    </Column>
                  </Row>
                </Link>
              ))}
            </Block>
          )}

          {content.lairNews.length > 0 && (
            <Block>
              <SectionTitle title="Les nouvelles de tes lieux" accent={color.primary} />
              {content.lairNews.map((news) => (
                <Link key={`${news.lairId}-${news.id}`} href={url(`/lairs/${news.lairId}`)} style={{ textDecoration: "none", display: "block", marginBottom: "10px" }}>
                  <div style={{ ...card, padding: "14px 16px" }}>
                    <Text style={text(12, { color: color.subtle })}>
                      {news.category && (
                        <span style={{ color: color.chip, backgroundColor: color.secondary, borderRadius: "999px", padding: "2px 8px", fontWeight: 600, marginRight: "8px" }}>
                          {news.category}
                        </span>
                      )}
                      {news.lairName} · {at(news.publishedAt).toFormat("cccc")}
                    </Text>
                    <Text style={text(16, { fontWeight: 700, marginTop: "6px" })}>{news.title}</Text>
                    {news.summary && <Text style={text(14, { color: color.muted, marginTop: "4px" })}>{news.summary}</Text>}
                    <Text style={text(13, { color: color.primary, fontWeight: 600, marginTop: "6px" })}>Lire l&apos;annonce</Text>
                  </div>
                </Link>
              ))}
            </Block>
          )}

          {content.registrations.length > 0 && (
            <Block>
              <SectionTitle title="Tes inscriptions" accent={color.primary} />
              <div style={card}>
                {content.registrations.map((registration, index) => {
                  const status =
                    registration.status === "registered"
                      ? { label: `Inscrit·e · ${when(registration.event.startDateTime)}`, color: color.good }
                      : registration.status === "pre-registered"
                        ? { label: `Pré-inscrit·e · ${when(registration.event.startDateTime)}`, color: color.muted }
                        : registration.status === "offer"
                          ? { label: `Une place t'attend jusqu'au ${when(registration.offerExpiresAt ?? "")}`, color: color.pick }
                          : { label: `Liste d'attente · ${registration.position}e`, color: color.pick };
                  return (
                    <ListRow
                      key={registration.event.id}
                      last={index === content.registrations.length - 1}
                      left={
                        <Link href={url(`/events/${registration.event.id}`)} style={{ textDecoration: "none" }}>
                          <Text style={text(15, { fontWeight: 600 })}>{registration.event.name}</Text>
                          {registration.event.lair && <Text style={text(13, { color: color.muted })}>{registration.event.lair.name}</Text>}
                        </Link>
                      }
                      right={<Text style={text(13, { color: status.color })}>{status.label}</Text>}
                    />
                  );
                })}
              </div>
            </Block>
          )}

          {content.playGroups.length > 0 && (
            <Block>
              <SectionTitle title="Tes groupes de jeu" accent={color.primary} />
              {content.playGroups.map((group) => (
                <div key={group.id} style={{ ...card, padding: "16px", marginBottom: "10px" }}>
                  <Text style={text(12, { color: color.subtle })}>{group.name}</Text>
                  {group.polls.map((poll) => (
                    <div key={poll.id} style={{ marginTop: "8px" }}>
                      <Text style={text(16, { fontWeight: 700 })}>Sondage ouvert : {poll.title}</Text>
                      <Text style={text(14, { color: color.muted, marginTop: "2px" })}>
                        {poll.respondents > 0
                          ? `${poll.respondents} membre${poll.respondents > 1 ? "s ont" : " a"} répondu, il manque ta réponse.`
                          : "Personne n'a encore répondu."}
                      </Text>
                    </div>
                  ))}
                  {group.polls.length > 0 && (
                    <Link
                      href={url(`/play-groups/${group.id}`)}
                      style={{ display: "inline-block", marginTop: "12px", backgroundColor: color.primary, color: color.onPrimary, fontFamily: font, fontSize: "14px", fontWeight: 700, textDecoration: "none", borderRadius: "8px", padding: "10px 16px" }}
                    >
                      Donner mes disponibilités
                    </Link>
                  )}
                  {group.sessions.map((session) => (
                    <Text key={session.id} style={text(15, { fontWeight: 600, marginTop: "10px" })}>
                      Session confirmée {when(session.startsAt)}
                      {session.place ? ` · ${session.place}` : ""}
                    </Text>
                  ))}
                  {group.unreadComments > 0 && (
                    <Text style={text(13, { color: color.muted, marginTop: "8px" })}>
                      <Link href={url(`/play-groups/${group.id}?view=decks`)} style={{ color: color.primary, textDecoration: "none" }}>
                        {group.unreadComments} nouveau{group.unreadComments > 1 ? "x" : ""} commentaire{group.unreadComments > 1 ? "s" : ""}
                      </Link>{" "}
                      sur les decks partagés du groupe.
                    </Text>
                  )}
                </div>
              ))}
            </Block>
          )}

          {content.agenda.length > 0 && (
            <Block>
              <SectionTitle title="Toute la semaine dans tes lieux" accent={color.primary} />
              <div style={card}>
                {content.agenda.map((event) => (
                  <ListRow
                    key={event.id}
                    left={
                      <Link href={url(`/events/${event.id}`)} style={{ textDecoration: "none" }}>
                        <Text style={text(12, { fontFamily: mono, color: color.chip, textTransform: "uppercase" })}>
                          {at(event.startDateTime).toFormat("ccc d")} · {at(event.startDateTime).toFormat("HH:mm")}
                        </Text>
                        <Text style={text(15, { fontWeight: 600 })}>{event.name}</Text>
                        {event.lair && <Text style={text(13, { color: color.muted })}>{event.lair.name}</Text>}
                      </Link>
                    }
                    right={<Text style={text(12, { color: color.subtle })}>{event.gameName ?? ""}</Text>}
                  />
                ))}
                <div style={{ padding: "12px 16px" }}>
                  <Action href={url("/events")}>Voir tout le calendrier</Action>
                </div>
              </div>
            </Block>
          )}

          {content.meta.length > 0 && (
            <Block>
              <SectionTitle title="La méta de tes jeux" accent={color.primary} />
              {content.meta.map((meta) => (
                <div key={meta.gameName} style={{ ...card, padding: "16px", marginBottom: "10px" }}>
                  <Text style={text(12, { color: color.subtle, marginBottom: "6px" })}>
                    {meta.gameName} · {meta.decks} decks de tournoi sur 14 jours
                  </Text>
                  {meta.legends.map((legend) => (
                    <Row key={legend.name}>
                      <Column>
                        <Text style={text(15, { fontWeight: 600 })}>{legend.name}</Text>
                      </Column>
                      <Column style={{ textAlign: "right" }}>
                        <Text style={text(14, { color: TREND[legend.trend].color })}>
                          {percent(legend.share)} des decks · {TREND[legend.trend].label}
                        </Text>
                      </Column>
                    </Row>
                  ))}
                  {meta.gameSlug && (
                    <div style={{ marginTop: "8px" }}>
                      <Action href={url(`/games/${meta.gameSlug}/meta`)}>Ouvrir la méta</Action>
                    </div>
                  )}
                </div>
              ))}
            </Block>
          )}

          {content.wishlist.length > 0 && (
            <Block>
              <SectionTitle title="Ta wishlist" accent={color.primary} />
              <div style={card}>
                {content.wishlist.map((offer, index) => (
                  <ListRow
                    key={`${offer.sellListId}-${index}`}
                    last={index === content.wishlist.length - 1}
                    left={
                      <Link href={url(`/sell-lists/${offer.sellListId}`)} style={{ textDecoration: "none" }}>
                        <Text style={text(15, { fontWeight: 600 })}>{offer.cardName}</Text>
                        <Text style={text(13, { color: color.muted })}>En vente chez {offer.ownerLabel}</Text>
                      </Link>
                    }
                    right={<Text style={text(14, { color: color.muted })}>{offer.price !== undefined ? price(offer.price, offer.currency) : ""}</Text>}
                  />
                ))}
              </div>
            </Block>
          )}

          {content.friendResults.length > 0 && (
            <Block>
              <SectionTitle title="Les résultats de tes amis" accent={color.primary} />
              <div style={card}>
                {content.friendResults.map((result, index) => {
                  const rank = result.placement
                    ? `${result.placement}${result.placement === 1 ? "er" : "e"}${result.playerCount ? ` sur ${result.playerCount}` : ""}`
                    : result.record
                      ? `${result.record.wins}-${result.record.losses}${result.record.draws ? `-${result.record.draws}` : ""}`
                      : "";
                  return (
                    <ListRow
                      key={result.id}
                      last={index === content.friendResults.length - 1}
                      left={
                        <Text style={text(15)}>
                          <strong>{result.friendName}</strong>
                          {rank ? ` · ${rank}` : ""} · {result.name}
                        </Text>
                      }
                      right={<Text style={text(13, { color: color.muted })}>{result.legendName ?? ""}</Text>}
                    />
                  );
                })}
              </div>
            </Block>
          )}

          {content.nearby.length > 0 && (
            <Block>
              <SectionTitle title="Près de chez toi" accent={color.primary} />
              <div style={{ ...card, padding: "14px 16px" }}>
                <Text style={text(15, { fontWeight: 600 })}>
                  {content.nearby.length > 1
                    ? `${content.nearby.length} lieux que tu ne suis pas jouent à tes jeux cette semaine`
                    : "Un lieu que tu ne suis pas joue à tes jeux cette semaine"}
                </Text>
                {content.nearby.map((lair) => (
                  <Text key={lair.id} style={text(14, { color: color.muted, marginTop: "4px" })}>
                    <Link href={url(`/lairs/${lair.id}`)} style={{ color: color.primary, textDecoration: "none" }}>
                      {lair.name}
                    </Link>{" "}
                    · {lair.distanceKm} km · {lair.events} évènement{lair.events > 1 ? "s" : ""}
                  </Text>
                ))}
              </div>
            </Block>
          )}

          {/* Pied */}
          <Section style={{ marginTop: "40px", paddingTop: "24px", borderTop: `1px solid ${color.border}` }}>
            <Text style={text(13, { color: color.subtle })}>
              Tu reçois cet email parce que tu as activé le récapitulatif hebdomadaire.{" "}
              <Link href={url("/account/notifications")} style={{ color: color.primary }}>Choisir les sections</Link> ·{" "}
              <Link href={url("/account/notifications")} style={{ color: color.primary }}>Se désinscrire</Link>
            </Text>
            <Text style={text(12, { color: color.subtle, marginTop: "8px" })}>
              Joutes te tient au courant de tes jeux dans tes communautés locales.{" "}
              <Link href="https://discord.gg/dZEGkZwJGB" style={{ color: color.subtle }}>Discord</Link> ·{" "}
              <Link href="https://x.com/JoutesApp" style={{ color: color.subtle }}>X</Link> ·{" "}
              <Link href="https://github.com/Joutes" style={{ color: color.subtle }}>GitHub</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default UserWeeklyEmail;
