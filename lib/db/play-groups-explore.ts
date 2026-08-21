import { countFollowersByPlayGroup, listPlayGroups, sortPlayGroupAnnouncements } from "@/lib/db/play-groups";
import { readNextSessionsByPlayGroup } from "@/lib/db/play-group-sessions";
import { getGameSummariesByIds } from "@/lib/db/games";
import { getLairsByIds } from "@/lib/db/lairs";
import { getUsersByIds } from "@/lib/db/users";
import { readLiveEmbed } from "@/lib/media/live-embed";
import { externalUrl } from "@/lib/lairs/urls";
import { readPlayGroupVisibility } from "@/lib/play-groups/access";
import {
  isFreshLive,
  readActivityRank,
  readInitials,
  sortExploreGroups,
  type ExploreGroup,
  type ExploreLive,
  type ExplorePost,
} from "@/lib/play-groups/explore";
import type { PlayGroup, PlayGroupContentItem } from "@/lib/types/PlayGroup";

/**
 * Le rôle d'armes : tout ce que la page d'exploration affiche, en une lecture.
 *
 * Les jointures sont faites ici, en gros paquets — abonnés, prochaines
 * sessions, jeux, lieux, diffuseurs — plutôt que groupe par groupe dans le
 * rendu : une page qui affiche cent groupes ferait sinon plusieurs centaines
 * d'allers-retours pour trois chiffres et deux noms par ligne.
 *
 * Les groupes privés sont écartés par la requête elle-même, avant toute
 * jointure : un groupe qu'on ne doit pas voir ne doit pas quitter la base.
 */
export type ExploreRoll = {
  groups: ExploreGroup[];
  /** Les directs en cours, tous groupes confondus, le plus suivi en tête. */
  lives: ExploreLive[];
  /** Les publications récentes, tous groupes confondus, la plus fraîche en tête. */
  posts: ExplorePost[];
};

/** Ce que « Les hérauts » montre au plus, et l'âge au-delà duquel une publication n'est plus une nouvelle. */
const HERALD_LIMIT = 3;
const HERALD_MAX_AGE_DAYS = 120;

export async function readExploreRoll(options: {
  host: string;
  limit?: number;
  /** Le lecteur : ses groupes privés lui restent visibles, ceux des autres non. */
  viewerId?: string | null;
}): Promise<ExploreRoll> {
  const groups = await listPlayGroups(options.limit, options.viewerId ?? null);
  const ids = groups.map((group) => group.id);

  const lairIds = groups
    .map((group) => group.options?.rhythm?.defaultPlace)
    .filter((place) => place?.kind === "joutes" && place.lairId)
    .map((place) => place!.lairId!);

  const gameIds = [...new Set(groups.flatMap((group) => group.enabledGameIds ?? []))];
  const streamerIds = [...new Set(groups.flatMap((group) => (group.options?.lives ?? []).map((live) => live.memberId)))];

  const [followers, nextSessions, lairs, games, streamers] = await Promise.all([
    countFollowersByPlayGroup(ids),
    readNextSessionsByPlayGroup(ids),
    getLairsByIds([...new Set(lairIds)]),
    getGameSummariesByIds(gameIds),
    getUsersByIds(streamerIds),
  ]);

  const lairById = new Map(lairs.map((lair) => [lair.id, lair]));
  const gameById = new Map(games.map((game) => [game.id, game]));
  const streamerById = new Map(streamers.map((user) => [user.id, user]));

  const now = Date.now();
  const lives: ExploreLive[] = [];
  const posts: ExplorePost[] = [];

  const rows = groups.map((group): ExploreGroup => {
    const theme = group.options?.theme;
    const place = group.options?.rhythm?.defaultPlace ?? null;
    const lair = place?.kind === "joutes" && place.lairId ? lairById.get(place.lairId) : undefined;
    const initials = readInitials(group.name);
    const accentColor = theme?.accentColor ?? null;

    // Seul un lieu Joutes porte une adresse géocodée ; un lieu libre reste sans
    // coordonnées, et le tri par distance le renverra en fin de rôle.
    const coordinates = lair?.location?.coordinates;
    const placeCoordinates = coordinates ? { longitude: coordinates[0], latitude: coordinates[1] } : null;

    const groupLives = (group.options?.lives ?? [])
      .map((live): ExploreLive | null => {
        const embed = readLiveEmbed(live.url, options.host);
        // Un direct déclaré la veille n'en est plus un : il quitte « En lice »
        // en même temps qu'il cesse de peser sur le rang. Montrer l'un sans
        // l'autre donnerait une vitrine qui ment ou un classement qui triche.
        if (!embed || !isFreshLive(live.startedAt, now)) {
          return null;
        }

        const streamer = streamerById.get(live.memberId);

        return {
          groupId: group.id,
          groupName: group.name,
          initials,
          accentColor,
          title: live.title ?? null,
          // Jamais l'adresse e-mail : cette page est servie à un visiteur non
          // connecté. `memberName` retombe sur l'identifiant, pas sur le
          // courriel, et c'est la règle qu'on suit ici.
          streamer: streamer?.displayName || streamer?.username || live.memberId,
          gameName: live.gameId ? (gameById.get(live.gameId)?.name ?? null) : null,
          viewers: typeof live.viewers === "number" ? live.viewers : null,
          startedAt: live.startedAt,
          channelUrl: embed.channelUrl,
          thumbnailUrl: embed.thumbnailUrl,
        };
      })
      .filter((live): live is ExploreLive => live !== null);

    lives.push(...groupLives);

    const contents = sortContents(group.options?.contents ?? []);
    const lastContent = contents[0];
    const lastAnnouncement = sortPlayGroupAnnouncements(group.options?.announcements ?? []).filter(
      (announcement) => announcement.scope === "public",
    )[0];

    posts.push(...contents.slice(0, HERALD_LIMIT).map((content) => toPost(group, content, initials, accentColor)));

    const lastDeed = readLastDeed(lastContent, lastAnnouncement?.publishedAt ?? null, lastAnnouncement?.title ?? null);
    const nextSessionAt = nextSessions.get(group.id) ?? null;

    return {
      id: group.id,
      name: group.name,
      initials,
      visibility: readPlayGroupVisibility(group),
      tagline: theme?.tagline ?? group.description ?? null,
      accentColor,
      logo: theme?.logo ?? null,
      rhythmLabel: group.options?.rhythm?.label ?? null,
      place: place ? { ...place, label: lair?.name ?? place.label } : null,
      placeCoordinates,
      gameNames: (group.enabledGameIds ?? [])
        .map((gameId) => gameById.get(gameId)?.name)
        .filter((name): name is string => !!name),
      memberCount: group.members.length,
      followerCount: followers.get(group.id) ?? 0,
      publishedCount: contents.length,
      lives: groupLives,
      lastDeed: lastDeed ?? (nextSessionAt ? { kind: "session", at: nextSessionAt, label: null } : null),
      createdAt: group.createdAt,
      activityRank: readActivityRank({
        liveCount: groupLives.length,
        lastDeedAt: lastDeed?.at ?? null,
        nextSessionAt,
        now,
      }),
    };
  });

  const heraldFloor = now - HERALD_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  return {
    groups: sortExploreGroups(rows, "vifs"),
    // Le compte de spectateurs n'est renseigné nulle part aujourd'hui (le
    // schéma d'un direct ne l'accepte pas) : sans lui, c'est le plus récemment
    // commencé qui prend le grand écran, plutôt qu'un ordre de base arbitraire.
    lives: lives.sort((a, b) => (b.viewers ?? 0) - (a.viewers ?? 0) || b.startedAt.localeCompare(a.startedAt)),
    posts: posts
      .filter((post) => {
        const at = Date.parse(post.publishedAt);
        return !Number.isNaN(at) && at >= heraldFloor;
      })
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .slice(0, HERALD_LIMIT),
  };
}

function sortContents(contents: PlayGroupContentItem[]): PlayGroupContentItem[] {
  return [...contents].sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/** Le dernier signe de vie hors direct : la publication ou l'annonce publique la plus récente. */
function readLastDeed(
  content: PlayGroupContentItem | undefined,
  announcementAt: string | null,
  announcementLabel: string | null,
) {
  if (content && (!announcementAt || content.publishedAt >= announcementAt)) {
    return { kind: "content" as const, at: content.publishedAt, label: content.title };
  }

  if (announcementAt) {
    return { kind: "announcement" as const, at: announcementAt, label: announcementLabel };
  }

  return null;
}

function toPost(
  group: PlayGroup,
  content: PlayGroupContentItem,
  initials: string,
  accentColor: string | null,
): ExplorePost {
  // Un article se lit sur Joutes ; une vidéo et un replay renvoient à leur
  // plateforme, où le lecteur est chez lui. Même règle que sur la vitrine.
  const isArticle = content.kind === "article";

  return {
    id: content.id,
    groupId: group.id,
    groupName: group.name,
    initials,
    accentColor,
    kind: content.kind,
    title: content.title,
    summary: content.summary ?? null,
    thumbnail: content.thumbnail ?? null,
    duration: content.duration ?? null,
    publishedAt: content.publishedAt,
    href: isArticle ? `/play-groups/${group.id}?view=showcase&article=${content.id}` : null,
    // Le même garde que la vitrine : une URL saisie à la main n'est posée sur
    // un `href` sortant qu'après avoir prouvé qu'elle est en http(s).
    url: isArticle ? null : externalUrl(content.url),
  };
}
