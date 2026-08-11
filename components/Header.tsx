"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import Image from "next/image";
import {Menu, Calendar, MapPin, User, UserRound, LogOut, Shield, Trophy, Dices, Library, Heart, Users, ChevronDown, Sparkles, Tag, Gamepad2, Plus, ArrowLeftRight, Boxes, BookOpen, Layers, ListChecks, Package, Scale, Settings2, Swords, type LucideIcon} from "lucide-react";
import { isAdmin } from "@/lib/config/admins";
import { Button } from "@/components/ui/button";
import { NotificationDropdown } from "@/components/NotificationDropdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
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
 */
function GamesCustomizeCorner({
  label,
  customizeLabel,
}: {
  label: string;
  customizeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Link
        href="/account#jeux"
        aria-label={customizeLabel}
        title={customizeLabel}
        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </Link>
    </div>
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

  useEffect(() => {
    if (!userId) {
      setFollowedGames([]);
      setFavoriteGameIds([]);
      return;
    }

    let cancelled = false;
    fetch("/api/users/me/games")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.games)) return;
        setFollowedGames(data.games);
        setFavoriteGameIds(Array.isArray(data.favoriteGameIds) ? data.favoriteGameIds : []);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Favoris, sinon jeux suivis, sinon raccourcis de la plateforme — la règle
  // vit dans `lib/games/nav-menu.ts`. Le temps du chargement, les raccourcis
  // tiennent la place plutôt que de laisser le menu se vider puis se remplir.
  const gamesSelection = selectMenuGames({
    followed: followedGames,
    favoriteIds: favoriteGameIds,
    defaults: DEFAULT_GAMES,
  });

  const toolLabels: Record<GameToolKey, string> = {
    // La fiche du jeu porte le nom du jeu : c'est le titre du menu autant que
    // sa première entrée.
    hub: gamesSelection.games[0]?.name ?? t('menu.Jeux'),
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

  // Un seul jeu à proposer : ses outils valent mieux qu'une liste d'un élément,
  // qui ne ferait qu'ajouter un clic avant d'y arriver.
  const gamesMenuItems: { href: string; label: string; icon: LucideIcon }[] = showsGameTools(gamesSelection)
    ? [
        ...gameToolLinks(gamesSelection.games[0]).map((tool) => ({
          href: tool.href,
          label: toolLabels[tool.key],
          icon: GAME_TOOL_ICONS[tool.key],
        })),
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

  // Qui n'a pas encore de favori a besoin qu'on lui montre où les poser : une
  // entrée en toutes lettres, dans la liste. Qui en a déjà connaît le chemin —
  // l'engrenage dans le coin suffit, et laisse la place à ses jeux. Le lien
  // passe par /account, qui renvoie vers la connexion pour un visiteur.
  const hasFavorites = gamesSelection.source === "favorites";
  if (!hasFavorites) {
    gamesMenuItems.push({ href: "/account#jeux", label: t('menu.CustomizeGames'), icon: Settings2 });
  }

  const eventsMenuItems: { href: string; label: string; icon: LucideIcon }[] = [
    { href: "/events", label: t('menu.Calendrier'), icon: Calendar },
    { href: "/leagues", label: t('menu.Ligues'), icon: Trophy },
    { href: "/game-matches", label: t('menu.Parties'), icon: Gamepad2 },
    { href: "/tournaments", label: t('menu.Tournois'), icon: Trophy },
    { href: "/tournaments/new", label: t('menu.OrganizeTournament'), icon: Plus },
    { href: "/events/new", label: t('menu.OrganizeEvent'), icon: Plus },
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
                    {gamesMenuItems.map((item) => (
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
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                  <Link href="/lairs">
                    <MapPin className="mr-1.5 h-4 w-4" />
                    {t('menu.Lieux')}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
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
              {session && (
                <NavigationMenuItem>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                    <Link href="/friends">
                      <UserRound className="mr-1.5 h-4 w-4" />
                      {t('menu.Amis')}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
              {session && (
                <NavigationMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger className={navigationMenuTriggerStyle()}>
                      <Users className="mr-1.5 h-4 w-4" />
                      {t('menu.Groupes')}
                      <ChevronDown className="ml-1 h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
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
              {session && isAdmin(session.user.email) && (
                <NavigationMenuItem>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                    <Link href="/admin">
                      <Shield className="mr-1.5 h-4 w-4" />
                      {t('menu.Administration')}
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
                    {gamesMenuItems.map((item) => (
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
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
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
                      href="/account#jeux"
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
                <Button variant="ghost" asChild className="justify-start">
                  <Link href="/friends" onClick={() => setMobileMenuOpen(false)}>
                    <UserRound className="mr-2 h-4 w-4" />
                    {t('menu.Amis')}
                  </Link>
                </Button>
              )}
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
              {session && (
                <>
                  <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">{t('menu.Groupes')}</p>
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
