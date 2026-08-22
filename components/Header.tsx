"use client";

import { Link } from "@/i18n/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import Image from "next/image";
import {Menu, Calendar, MapPin, User, UserRound, LogOut, Shield, Trophy, Dices, Library, Heart, Users, ChevronDown, Sparkles, Tag, Gamepad2, Plus, ArrowLeftRight, Boxes, BookOpen, Layers, ListChecks, Package, Scale, Settings2, Store, Swords, type LucideIcon} from "lucide-react";
import { isAdmin } from "@/lib/config/admins";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { GAMES_CHANGED_EVENT } from "@/lib/games/games-changed";
import {
  type GameToolKey,
  type NavGame,
  gameToolLinks,
  selectMenuGames,
  showsGameTools,
} from "@/lib/games/nav-menu";
import {useTranslations} from "next-intl";
import LocaleSwitcher from "@/components/locale-switcher";
import { CommandBox } from "@/components/CommandBox";
import { cn } from "@/lib/utils";

/**
 * Raccourcis affichés dans le menu « Jeux » tant qu'on ne sait rien des goûts
 * du visiteur : les jeux les plus joués de la plateforme. Un utilisateur
 * connecté qui suit des jeux — ou qui en a mis en favori — voit les siens à la
 * place.
 */
const DEFAULT_GAMES: NavGame[] = [
  { id: "riftbound", name: "Riftbound", slug: "riftbound" },
  { id: "mtg", name: "Magic: The Gathering", slug: "mtg" },
  { id: "swu", name: "Star Wars Unlimited", slug: "swu" },
];

/**
 * Le menu déroulant reste un raccourci, pas un catalogue : au-delà de quelques
 * entrées il devient plus long à parcourir que la page « Tous les jeux », qui
 * le suit d'un clic.
 *
 * Le plafond s'applique **après** le choix de la source, jamais aux jeux
 * suivis à la lecture : un favori posé sur le huitième jeu suivi disparaîtrait
 * sans cela du menu qu'il est censé commander.
 */
const MAX_GAMES_IN_MENU = 5;

/**
 * Style d'une entrée de la barre qui mène droit à une page — « Lieux »,
 * « Amis »… — par opposition à celles qui ouvrent un menu.
 *
 * Les secondes sont des `DropdownMenuTrigger` et ne portent que
 * `navigationMenuTriggerStyle()` ; les premières sont des
 * `NavigationMenuLink`, dont le style de base empile ses enfants
 * (`flex flex-col gap-1`) — pensé pour les panneaux riches d'un menu de
 * navigation, pas pour une entrée d'une ligne. Le style de déclencheur ne
 * redresse pas la direction : il n'y a pas de `flex-row` à emporter la mise sur
 * `flex-col`. L'icône passait donc **au-dessus** du libellé, que la hauteur
 * fixe (`h-9`) rognait aussitôt — d'où une barre dont une entrée sur deux
 * n'avait plus d'icône et dont le texte tombait quelques pixels plus bas que
 * ses voisines.
 *
 * `gap-0` annule l'espacement du style de base : ce sont les icônes qui portent
 * leur marge (`mr-1.5`), exactement comme dans les entrées à menu.
 */
const navLinkStyle = cn(navigationMenuTriggerStyle(), "flex-row gap-0");

/** Illustration de chaque outil d'un jeu, quand le menu les propose. */
const GAME_TOOL_ICONS: Record<GameToolKey, LucideIcon> = {
  hub: Dices,
  cards: Layers,
  tournaments: Trophy,
  products: Package,
  battleReports: Swords,
  collection: Library,
  rules: BookOpen,
  policies: Scale,
  cubes: Boxes,
  deckChecker: ListChecks,
};

/**
 * Le coin du menu « Jeux » : son titre, et l'engrenage qui mène au choix des
 * favoris. Rendu seulement quand l'utilisateur en a déjà — sinon c'est une
 * entrée en toutes lettres qui l'invite à en poser, un engrenage muet ne
 * s'expliquant de lui-même qu'à qui sait déjà ce qu'il y a derrière.
 *
 * C'est un `DropdownMenuItem` malgré son allure d'en-tête : dans un menu Radix,
 * seuls les items entrent dans la navigation au clavier et portent le rôle
 * attendu. Un lien posé à même le contenu serait inatteignable aux flèches.
 */
function GamesCustomizeCorner({
  label,
  customizeLabel,
}: {
  label: string;
  customizeLabel: string;
}) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href="/account?tab=games"
        aria-label={customizeLabel}
        title={customizeLabel}
        className="flex w-full cursor-pointer items-center justify-between gap-2"
      >
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
      </Link>
    </DropdownMenuItem>
  );
}

type MenuEntry = { href: string; label: string; icon: LucideIcon };

/**
 * Un jeu de la liste, et ses outils en sous-menu.
 *
 * La galerie de cartes d'un jeu était à deux pages de la barre de navigation ;
 * on la trouvait par hasard, en passant par sa collection. L'entrée du jeu
 * reste cliquable et mène à sa fiche : le sous-menu ajoute des chemins, il n'en
 * retire aucun.
 */
function GameToolsSubmenu({ item, tools }: { item: MenuEntry; tools: MenuEntry[] }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer">
        <item.icon className="mr-2 h-4 w-4" />
        <span>{item.label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem asChild>
          <Link href={item.href} className="flex w-full cursor-pointer">
            <item.icon className="mr-2 h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {tools.map((tool) => (
          <DropdownMenuItem asChild key={tool.href}>
            <Link href={tool.href} className="flex w-full cursor-pointer">
              <tool.icon className="mr-2 h-4 w-4" />
              <span>{tool.label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export default function Header() {
  const t = useTranslations('Header');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, isPending } = useSession();
  const [playGroups, setPlayGroups] = useState<{ id: string; name: string }[]>([]);
  const [followedGames, setFollowedGames] = useState<NavGame[]>([]);
  const [favoriteGameIds, setFavoriteGameIds] = useState<string[]>([]);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) {
      setPlayGroups([]);
      return;
    }

    let cancelled = false;
    fetch("/api/play-groups")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.groups)) {
          setPlayGroups(data.groups.slice(0, 3));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loadGames = useCallback((signal?: AbortSignal) => {
    if (!userId) {
      setFollowedGames([]);
      setFavoriteGameIds([]);
      return;
    }

    fetch("/api/users/me/games", { signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (signal?.aborted || !Array.isArray(data?.games)) return;
        setFollowedGames(data.games);
        setFavoriteGameIds(Array.isArray(data.favoriteGameIds) ? data.favoriteGameIds : []);
      })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    loadGames(controller.signal);
    return () => controller.abort();
  }, [loadGames]);

  // Suivre un jeu, le mettre en favori : cela se fait ailleurs (fiche du jeu,
  // page du compte) et l'en-tête, composant client, ne serait pas rejoué par
  // `router.refresh()`. Il se remet donc à jour au signal.
  useEffect(() => {
    const reload = () => loadGames();
    window.addEventListener(GAMES_CHANGED_EVENT, reload);
    return () => window.removeEventListener(GAMES_CHANGED_EVENT, reload);
  }, [loadGames]);

  // Favoris, sinon jeux suivis, sinon raccourcis de la plateforme — la règle
  // vit dans `lib/games/nav-menu.ts`. Le temps du chargement, les raccourcis
  // tiennent la place plutôt que de laisser le menu se vider puis se remplir.
  const gamesSelection = selectMenuGames({
    followed: followedGames,
    favoriteIds: favoriteGameIds,
    defaults: DEFAULT_GAMES,
  });

  const toolLabels: Record<GameToolKey, string> = {
    // « hub » n'est jamais rendu avec ce libellé : la fiche d'un jeu porte le
    // nom du jeu, que l'appelant substitue. Il est là pour que la table reste
    // complète, et que l'ajout d'un outil ne puisse pas l'oublier.
    hub: t('menu.Jeux'),
    cards: t('menu.tools.cards'),
    tournaments: t('menu.Tournois'),
    products: t('menu.tools.products'),
    battleReports: t('menu.tools.battleReports'),
    collection: t('menu.Collection'),
    rules: t('menu.tools.rules'),
    policies: t('menu.tools.policies'),
    cubes: t('menu.tools.cubes'),
    deckChecker: t('menu.tools.deckChecker'),
  };

  /** Les outils d'un jeu, prêts à afficher : lien, libellé, illustration. */
  const toolsOf = (game: NavGame) =>
    gameToolLinks(game).map((tool) => ({
      href: tool.href,
      label: tool.key === "hub" ? game.name : toolLabels[tool.key],
      icon: GAME_TOOL_ICONS[tool.key],
    }));

  // Un seul jeu à proposer : ses outils valent mieux qu'une liste d'un élément,
  // qui ne ferait qu'ajouter un clic avant d'y arriver.
  const gamesMenuItems: { href: string; label: string; icon: LucideIcon }[] = showsGameTools(gamesSelection)
    ? [
        ...toolsOf(gamesSelection.games[0]),
        { href: "/games", label: t('menu.AllGames'), icon: Dices },
      ]
    : [
        { href: "/games", label: t('menu.AllGames'), icon: Dices },
        ...gamesSelection.games.slice(0, MAX_GAMES_IN_MENU).map((game) => ({
          href: `/games/${game.slug ?? game.id}`,
          label: game.name,
          icon: Dices,
        })),
      ];

  /**
   * En liste, chaque jeu ouvre ses outils en sous-menu — la galerie de cartes
   * d'un jeu était jusqu'ici à deux pages de distance, et on la trouvait par
   * hasard en passant par sa collection. Rien ne se perd : l'entrée du jeu
   * reste cliquable et mène à sa fiche.
   */
  const gamesSubmenus = showsGameTools(gamesSelection)
    ? new Map<string, { href: string; label: string; icon: LucideIcon }[]>()
    : new Map(
        gamesSelection.games.slice(0, MAX_GAMES_IN_MENU).map((game) => {
          const tools = toolsOf(game);
          // Un jeu qui n'ouvre aucun outil n'a pas de sous-menu à montrer :
          // il ne resterait que sa fiche, déjà atteinte par l'entrée elle-même.
          return [`/games/${game.slug ?? game.id}`, tools.length > 1 ? tools.slice(1) : []];
        })
      );

  // Qui n'a pas encore de favori a besoin qu'on lui montre où les poser : une
  // entrée en toutes lettres, dans la liste. Qui en a déjà connaît le chemin —
  // l'engrenage dans le coin suffit, et laisse la place à ses jeux. Le lien
  // passe par /account, qui renvoie vers la connexion pour un visiteur.
  const hasFavorites = gamesSelection.source === "favorites";
  if (!hasFavorites) {
    gamesMenuItems.push({ href: "/account?tab=games", label: t('menu.CustomizeGames'), icon: Settings2 });
  }

  const eventsMenuItems: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/events", label: t('menu.Calendrier'), icon: Calendar },
    { href: "/leagues", label: t('menu.Ligues'), icon: Trophy },
    { href: "/game-matches", label: t('menu.Parties'), icon: Gamepad2 },
    { href: "/tournaments", label: t('menu.Tournois'), icon: Trophy },
    { href: "/tournaments/new", label: t('menu.OrganizeTournament'), icon: Plus },
    { href: "/events/new", label: t('menu.OrganizeEvent'), icon: Plus },
    { href: "/features/organizers", label: t('menu.ForOrganizers'), icon: Store },
  ];

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header
      data-print-hidden
      className="top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      <nav className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 font-bold text-2xl">
            <Image src={`/logo/joutes_logo${process.env.NEXT_PUBLIC_THEME === 'default' ? '' : process.env.NEXT_PUBLIC_THEME}.png`} alt="Joutes Logo" width={120} height={120} className="rounded-full size-6" />
            <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
              Joutes
            </span>
          </Link>

          {/* Desktop Navigation */}
          <NavigationMenu className="hidden xl:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                    <Dices className="mr-1.5 h-4 w-4" />
                    {t('menu.Jeux')}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {hasFavorites && (
                      <GamesCustomizeCorner label={t('menu.Jeux')} customizeLabel={t('menu.CustomizeGames')} />
                    )}
                    {gamesMenuItems.map((item) => {
                      const tools = gamesSubmenus.get(item.href);
                      return tools && tools.length > 0 ? (
                        <GameToolsSubmenu key={item.href} item={item} tools={tools} />
                      ) : (
                        <DropdownMenuItem asChild key={item.href}>
                          <Link href={item.href} className="flex w-full cursor-pointer">
                            <item.icon className="mr-2 h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                    <Calendar className="mr-1.5 h-4 w-4" />
                    {t('menu.Événements')}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {eventsMenuItems.map((item) => (
                      <DropdownMenuItem asChild key={item.href}>
                        <Link href={item.href} className="flex w-full cursor-pointer">
                          <item.icon className="mr-2 h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navLinkStyle} asChild>
                  <Link href="/lairs">
                    <MapPin className="mr-1.5 h-4 w-4" />
                    {t('menu.Lieux')}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navLinkStyle} asChild>
                  <Link href="/features">
                    <Sparkles className="mr-1.5 h-4 w-4" />
                    {t('menu.Fonctionnalités')}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              {session && (
                <NavigationMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                      <Library className="mr-1.5 h-4 w-4" />
                      {t('menu.Collection')}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem asChild>
                        <Link href="/collection" className="flex w-full cursor-pointer">
                          <Library className="mr-2 h-4 w-4" />
                          <span>{t('menu.Collection')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/wishlists" className="flex w-full cursor-pointer">
                          <Heart className="mr-2 h-4 w-4" />
                          <span>{t('menu.Wishlists')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/cubes" className="flex w-full cursor-pointer">
                          <Boxes className="mr-2 h-4 w-4" />
                          <span>{t('menu.Cubes')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/sell-lists" className="flex w-full cursor-pointer">
                          <Tag className="mr-2 h-4 w-4" />
                          <span>{t('menu.SellLists')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/trade" className="flex w-full cursor-pointer">
                          <ArrowLeftRight className="mr-2 h-4 w-4" />
                          <span>{t('menu.Trade')}</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </NavigationMenuItem>
              )}
              {/* Les amis et les groupes de jeu tenaient deux entrées de la
                  barre pour une même chose : les gens avec qui on joue. Un
                  seul menu « Social » les réunit, et rend sa place au reste. */}
              {session && (
                <NavigationMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                      <Users className="mr-1.5 h-4 w-4" />
                      {t('menu.Social')}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem asChild>
                        <Link href="/friends" className="flex w-full cursor-pointer">
                          <UserRound className="mr-2 h-4 w-4" />
                          <span>{t('menu.Amis')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {playGroups.map((group) => (
                        <DropdownMenuItem asChild key={group.id}>
                          <Link href={`/play-groups/${group.id}`} className="flex w-full cursor-pointer">
                            <Users className="mr-2 h-4 w-4" />
                            <span className="truncate">{group.name}</span>
                          </Link>
                        </DropdownMenuItem>
                      ))}
                      {playGroups.length > 0 && <DropdownMenuSeparator />}
                      <DropdownMenuItem asChild>
                        <Link href="/play-groups" className="flex w-full cursor-pointer">
                          <Users className="mr-2 h-4 w-4" />
                          <span>{t('menu.PlayGroups')}</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </NavigationMenuItem>
              )}
              {/* L'administration ne se montre qu'à qui l'administre, et celui-là
                  n'a pas besoin qu'on lui rappelle ce qu'est un bouclier : l'icône
                  seule, avec son libellé en infobulle et pour les lecteurs d'écran. */}
              {session && isAdmin(session.user.email) && (
                <NavigationMenuItem>
                  <NavigationMenuLink className={navLinkStyle} asChild>
                    <Link
                      href="/admin"
                      aria-label={t('menu.Administration')}
                      title={t('menu.Administration')}
                    >
                      <Shield className="h-4 w-4" />
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>

          {/* Medium Navigation (e.g. iPad): a trimmed-down set of entries shown inline
              between md and xl, where there isn't enough room for the full desktop nav. */}
          <NavigationMenu className="hidden md:flex xl:hidden">
            <NavigationMenuList>
              <NavigationMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                    <Dices className="mr-1.5 h-4 w-4" />
                    {t('menu.Jeux')}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {hasFavorites && (
                      <GamesCustomizeCorner label={t('menu.Jeux')} customizeLabel={t('menu.CustomizeGames')} />
                    )}
                    {gamesMenuItems.map((item) => {
                      const tools = gamesSubmenus.get(item.href);
                      return tools && tools.length > 0 ? (
                        <GameToolsSubmenu key={item.href} item={item} tools={tools} />
                      ) : (
                        <DropdownMenuItem asChild key={item.href}>
                          <Link href={item.href} className="flex w-full cursor-pointer">
                            <item.icon className="mr-2 h-4 w-4" />
                            <span>{item.label}</span>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <DropdownMenu>
                  <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                    <Calendar className="mr-1.5 h-4 w-4" />
                    {t('menu.Événements')}
                    <ChevronDown className="ml-1 h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {eventsMenuItems.map((item) => (
                      <DropdownMenuItem asChild key={item.href}>
                        <Link href={item.href} className="flex w-full cursor-pointer">
                          <item.icon className="mr-2 h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navLinkStyle} asChild>
                  <Link href="/lairs">
                    <MapPin className="mr-1.5 h-4 w-4" />
                    {t('menu.Lieux')}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              {session && (
                <NavigationMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                      <Library className="mr-1.5 h-4 w-4" />
                      {t('menu.Collection')}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem asChild>
                        <Link href="/collection" className="flex w-full cursor-pointer">
                          <Library className="mr-2 h-4 w-4" />
                          <span>{t('menu.Collection')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/wishlists" className="flex w-full cursor-pointer">
                          <Heart className="mr-2 h-4 w-4" />
                          <span>{t('menu.Wishlists')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/cubes" className="flex w-full cursor-pointer">
                          <Boxes className="mr-2 h-4 w-4" />
                          <span>{t('menu.Cubes')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/sell-lists" className="flex w-full cursor-pointer">
                          <Tag className="mr-2 h-4 w-4" />
                          <span>{t('menu.SellLists')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href="/trade" className="flex w-full cursor-pointer">
                          <ArrowLeftRight className="mr-2 h-4 w-4" />
                          <span>{t('menu.Trade')}</span>
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>

          {/* Right side: command box + user menus (desktop and mobile variants) */}
          <div className="flex items-center gap-2">
            <CommandBox />

            {/* User Menu (Desktop) */}
            <div className="hidden xl:flex xl:items-center xl:gap-2">
              {isPending ? (
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : session ? (
                <>
                  <LocaleSwitcher />
                  <NotificationDropdown userId={session.user.id} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-2">
                        <User className="h-4 w-4" />
                        <span className="max-w-[150px] truncate">
                          {session.user.email}
                        </span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>{t('menu.myAccount')}</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/account" className="flex w-full cursor-pointer">
                          <User className="mr-2 h-4 w-4" />
                          <span>{t('menu.Mon Profil')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem asChild>
                        <Link href="/account/achievements" className="flex w-full cursor-pointer">
                          <Trophy className="mr-2 h-4 w-4" />
                          <span>{t('menu.Succès')}</span>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>{t('menu.Déconnexion')}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              ) : (
                <>
                  <LocaleSwitcher />
                  <Button asChild>
                    <Link href="/login">{t('menu.Se connecter')}</Link>
                  </Button>
                </>
              )}
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center gap-2 xl:hidden">
              {!isPending && session && (
                <>
                  <LocaleSwitcher />
                  <NotificationDropdown userId={session.user.id} />
                  <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <User className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-xs text-muted-foreground truncate">
                          {session.user.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/account" className="flex w-full cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>{t('menu.Mon Profil')}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href="/account/achievements" className="flex w-full cursor-pointer">
                        <Trophy className="mr-2 h-4 w-4" />
                        <span>{t('menu.Succès')}</span>
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>{t('menu.Déconnexion')}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                </>
              )}

              {!isPending && !session && (
                <Button size="sm" asChild>
                  <Link href="/login">{t('menu.Connexion')}</Link>
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMobileMenu}
                aria-label="Menu"
              >
                {mobileMenuOpen ? (
                  <Menu className="h-5 w-5 rotate-90 transition-transform" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="border-t py-4 xl:hidden">
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 md:hidden">
                <div className="flex items-center justify-between gap-2 px-3 pt-2">
                  <p className="text-xs font-medium text-muted-foreground">{t('menu.Jeux')}</p>
                  {hasFavorites && (
                    <Link
                      href="/account?tab=games"
                      onClick={() => setMobileMenuOpen(false)}
                      aria-label={t('menu.CustomizeGames')}
                      title={t('menu.CustomizeGames')}
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Settings2 className="h-4 w-4" />
                    </Link>
                  )}
                </div>
                {gamesMenuItems.map((item) => (
                  <Button variant="ghost" asChild className="w-full justify-start" key={item.href}>
                    <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Link>
                  </Button>
                ))}
              </div>
              <div className="flex flex-col gap-2 md:hidden">
                <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">{t('menu.Événements')}</p>
                {eventsMenuItems.map((item) => (
                  <Button variant="ghost" asChild className="w-full justify-start" key={item.href}>
                    <Link href={item.href} onClick={() => setMobileMenuOpen(false)}>
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.label}
                    </Link>
                  </Button>
                ))}
              </div>
              <Button variant="ghost" asChild className="justify-start md:hidden">
                <Link href="/lairs" onClick={() => setMobileMenuOpen(false)}>
                  <MapPin className="mr-2 h-4 w-4" />
                  {t('menu.Lieux')}
                </Link>
              </Button>
              <Button variant="ghost" asChild className="justify-start">
                <Link href="/features" onClick={() => setMobileMenuOpen(false)}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {t('menu.Fonctionnalités')}
                </Link>
              </Button>
              {session && (
                <div className="flex flex-col gap-2 md:hidden">
                  <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">{t('menu.Collection')}</p>
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link href="/collection" onClick={() => setMobileMenuOpen(false)}>
                      <Library className="mr-2 h-4 w-4" />
                      {t('menu.Collection')}
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link href="/wishlists" onClick={() => setMobileMenuOpen(false)}>
                      <Heart className="mr-2 h-4 w-4" />
                      {t('menu.Wishlists')}
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link href="/cubes" onClick={() => setMobileMenuOpen(false)}>
                      <Boxes className="mr-2 h-4 w-4" />
                      {t('menu.Cubes')}
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link href="/sell-lists" onClick={() => setMobileMenuOpen(false)}>
                      <Tag className="mr-2 h-4 w-4" />
                      {t('menu.SellLists')}
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild className="w-full justify-start">
                    <Link href="/trade" onClick={() => setMobileMenuOpen(false)}>
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                      {t('menu.Trade')}
                    </Link>
                  </Button>
                </div>
              )}
              {/* Même regroupement que la barre : amis et groupes de jeu sous
                  un seul intitulé, pour que les deux navigations racontent la
                  même chose. */}
              {session && (
                <>
                  <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">{t('menu.Social')}</p>
                  <Button variant="ghost" asChild className="justify-start">
                    <Link href="/friends" onClick={() => setMobileMenuOpen(false)}>
                      <UserRound className="mr-2 h-4 w-4" />
                      {t('menu.Amis')}
                    </Link>
                  </Button>
                  {playGroups.map((group) => (
                    <Button variant="ghost" asChild className="justify-start" key={group.id}>
                      <Link href={`/play-groups/${group.id}`} onClick={() => setMobileMenuOpen(false)}>
                        <Users className="mr-2 h-4 w-4" />
                        <span className="truncate">{group.name}</span>
                      </Link>
                    </Button>
                  ))}
                  <Button variant="ghost" asChild className="justify-start">
                    <Link href="/play-groups" onClick={() => setMobileMenuOpen(false)}>
                      <Users className="mr-2 h-4 w-4" />
                      {t('menu.PlayGroups')}
                    </Link>
                  </Button>
                </>
              )}
              {session && isAdmin(session.user.email) && (
                <Button variant="ghost" asChild className="justify-start">
                  <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <Shield className="mr-2 h-4 w-4" />
                    {t('menu.Administration')}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
