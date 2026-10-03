import type { IndexDefinition } from "./ensure";

/**
 * Comptes, sessions, réseau social, notifications et groupes de jeu.
 *
 * Plusieurs collections posent déjà leurs index au chargement de leur module
 * (`trades`, `subscriptions`, `reports`, `wishlists`, `settings`…) : ils ne
 * sont pas repris ici.
 */
export const USER_INDEXES: IndexDefinition[] = [
  // better-auth, avec l'adaptateur MongoDB, ne crée aucun index. Les sessions
  // sont en base : chaque `getSession` cherche son jeton dans `session`.
  {
    collection: "session",
    keys: { token: 1 },
    why: "La session de chaque requête authentifiée",
  },
  {
    collection: "session",
    keys: { userId: 1 },
    why: "Les sessions d'une personne (liste, révocation)",
  },
  {
    collection: "account",
    keys: { providerId: 1, accountId: 1 },
    why: "Le compte lié derrière chaque interaction Discord, le retour OAuth, Patreon",
  },
  {
    collection: "account",
    keys: { userId: 1, providerId: 1 },
    why: "Les comptes liés d'une personne, et l'envoi Discord à plusieurs",
  },
  {
    collection: "verification",
    keys: { identifier: 1 },
    why: "La vérification d'un code de connexion par e-mail",
  },
  {
    collection: "passkey",
    keys: { userId: 1 },
    why: "Les clés d'accès d'une personne",
  },

  {
    collection: "user",
    keys: { email: 1 },
    why: "Connexion par e-mail et invitations",
  },
  {
    collection: "user",
    keys: { displayName: 1, discriminator: 1 },
    options: { collation: { locale: "en", strength: 2 }, name: "displayName_1_discriminator_1_en_2" },
    why: "Le profil d'une personne par son tag (pseudo#0000), insensible à la casse",
  },
  {
    collection: "user",
    keys: { friendCode: 1 },
    options: { unique: true, sparse: true },
    why: "Le code ami (QR) ; l'unicité garantit qu'un code ne désigne qu'une personne",
  },
  {
    collection: "user",
    keys: { lairs: 1 },
    why: "Les abonnés d'un lieu, destinataires de ses notifications",
  },
  {
    collection: "user",
    keys: { isPublicProfile: 1, createdAt: -1 },
    why: "Le registre des profils, trié par ancienneté",
  },
  {
    collection: "user",
    keys: { isPublicProfile: 1, displayName: 1 },
    why: "Le registre des profils, trié par nom",
  },
  {
    collection: "user",
    keys: { isPublicProfile: 1, games: 1 },
    why: "Le registre des profils filtré par jeu",
  },
  {
    collection: "user",
    keys: { isPublicProfile: 1, "showcase.showCity": 1, "location.city": 1 },
    why: "Le registre des profils filtré par ville",
  },

  {
    collection: "userFollowers",
    keys: { userId: 1, followerId: 1 },
    options: { unique: true },
    why: "On ne suit une personne qu'une fois ; sert le décompte des abonnés",
  },
  {
    collection: "userFollowers",
    keys: { followerId: 1 },
    why: "Les personnes que je suis",
  },
  {
    collection: "userContents",
    keys: { authorId: 1, publishedAt: -1 },
    why: "Les publications d'une personne",
  },
  {
    collection: "userContents",
    keys: { visibility: 1, authorId: 1, publishedAt: -1 },
    why: "Les publications publiques d'une liste d'auteurs (vitrine d'un groupe)",
  },
  {
    collection: "userContents",
    keys: { visibility: 1, publishedAt: -1 },
    why: "Le fil de l'accueil, tous jeux confondus",
  },
  {
    collection: "userContents",
    keys: { visibility: 1, gameId: 1, publishedAt: -1 },
    why: "Le fil de l'accueil, sur un jeu",
  },
  {
    collection: "friendRequests",
    keys: { pairKey: 1 },
    options: { unique: true, partialFilterExpression: { status: "pending" } },
    why: "Une seule demande en attente par paire ; `createFriendRequest` compte sur l'erreur de doublon",
  },
  {
    collection: "friendRequests",
    keys: { recipientId: 1, status: 1, createdAt: -1 },
    why: "Les demandes d'ami reçues",
  },
  {
    collection: "friendRequests",
    keys: { id: 1 },
    why: "Accepter ou refuser une demande",
  },
  {
    collection: "user-achievements",
    keys: { userId: 1, achievementId: 1 },
    why: "Les badges lus à chaque session, et le déblocage d'un succès",
  },
  {
    collection: "user-achievements",
    keys: { achievementId: 1 },
    why: "Le retrait d'un succès supprimé",
  },
  {
    collection: "api_keys",
    keys: { key: 1 },
    why: "L'authentification de chaque appel d'API et MCP par clé",
  },
  {
    collection: "api_keys",
    keys: { userId: 1, createdAt: -1 },
    why: "Les clés d'une personne",
  },

  {
    collection: "notifications",
    keys: { id: 1 },
    why: "Lire, masquer ou supprimer une notification",
  },
  {
    collection: "push_devices",
    keys: { token: 1 },
    options: { unique: true },
    why: "Un appareil par jeton de push",
  },
  {
    collection: "push_devices",
    keys: { userId: 1, state: 1 },
    why: "Les appareils actifs d'une personne, à qui envoyer",
  },
  {
    collection: "push_devices",
    keys: { installationId: 1, userId: 1 },
    why: "La réattribution d'un appareil qui change de compte",
  },
  {
    collection: "push_jobs",
    keys: { notificationId: 1 },
    why: "L'upsert qui met une notification en file d'envoi",
  },
  {
    collection: "push_jobs",
    keys: { state: 1, createdAt: 1 },
    why: "Le cron qui prend le plus ancien envoi en attente",
  },

  {
    collection: "playGroups",
    keys: { id: 1 },
    why: "Toute lecture ou action sur un groupe de jeu",
  },
  {
    collection: "playGroups",
    keys: { visibility: 1, updatedAt: -1 },
    why: "Le rôle d'armes : branche « visible »",
  },
  {
    collection: "playGroups",
    keys: { "members.userId": 1, updatedAt: -1 },
    why: "Le rôle d'armes : branche « j'en suis membre », et mes groupes",
  },
  {
    collection: "playGroupFollowers",
    keys: { playGroupId: 1, userId: 1 },
    options: { unique: true },
    why: "On ne suit un groupe qu'une fois",
  },
  {
    collection: "playGroupFollowers",
    keys: { userId: 1 },
    why: "Les groupes que je suis",
  },
  {
    collection: "playGroupInvitations",
    keys: { id: 1 },
    why: "Accepter, refuser ou annuler une invitation",
  },
  {
    collection: "playGroupInvitations",
    keys: { invitedUserId: 1, status: 1, createdAt: -1 },
    why: "Les invitations reçues",
  },
  {
    collection: "playGroupInvitations",
    keys: { playGroupId: 1, status: 1, createdAt: -1 },
    why: "Les invitations en attente d'un groupe",
  },
  {
    collection: "playGroupSessions",
    keys: { playGroupId: 1, status: 1, startsAt: 1 },
    why: "Les séances d'un groupe, à venir ou passées",
  },
  {
    collection: "playGroupSessions",
    keys: { id: 1 },
    options: { unique: true },
    why: "Une séance par identifiant",
  },

  {
    collection: "stream_links",
    keys: { userId: 1, platform: 1 },
    options: { unique: true },
    why: "Une liaison par compte et par plateforme ; sert aussi l'écran de compte",
  },
  {
    collection: "stream_links",
    keys: { platform: 1, channelId: 1 },
    options: { unique: true },
    why: "Le chemin des webhooks, qui n'apprennent qu'une plateforme et une chaîne",
  },
  {
    collection: "stream_links",
    keys: { "subscription.expiresAt": 1 },
    why: "Le renouvellement des baux WebSub, qui ne veut que les échéances proches",
  },
  {
    collection: "game_streams",
    keys: { gameId: 1, platform: 1 },
    options: { unique: true },
    why: "Un jeu ne suit qu'une chaîne par plateforme ; c'est aussi la clé de l'upsert du cron",
  },
  {
    collection: "game_streams",
    keys: { live: 1 },
    why: "Les vitrines ne veulent que ce qui diffuse, et le cas courant est qu'il n'y en ait aucun",
  },
  {
    collection: "game_social_posts",
    keys: { gameId: 1, platform: 1, externalId: 1 },
    options: { unique: true },
    why: "Une publication n'existe qu'une fois par jeu ; c'est la clé de l'upsert de la collecte",
  },
  {
    collection: "game_social_posts",
    keys: { gameId: 1, hiddenAt: 1, publishedAt: -1 },
    why: "La lecture des vitrines et le tri de la purge, qui posent la même question",
  },
];
