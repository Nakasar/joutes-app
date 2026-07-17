"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import Image from "next/image";
import {Menu, Calendar, MapPin, User, UserRound, LogOut, Shield, Trophy, Dices, Library, Heart, Users, ChevronDown, Sparkles, Tag} from "lucide-react";
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
import {useTranslations} from "next-intl";
import LocaleSwitcher from "@/components/locale-switcher";

export default function Header() {
  const t = useTranslations('Header');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, isPending } = useSession();
  const [playGroups, setPlayGroups] = useState<{ id: string; name: string }[]>([]);

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

  const toggleMobileMenu = () => setMobileMenuOpen(!mobileMenuOpen);

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <header className="top-0 z-50 w-full border-b backdrop-blur supports-[backdrop-filter]:bg-background/60">
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
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                  <Link href="/games">
                    <Dices className="mr-1.5 h-4 w-4" />
                    {t('menu.Jeux')}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                  <Link href="/events">
                    <Calendar className="mr-1.5 h-4 w-4" />
                    {t('menu.Événements')}
                  </Link>
                </NavigationMenuLink>
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
                        <Link href="/sell-lists" className="flex w-full cursor-pointer">
                          <Tag className="mr-2 h-4 w-4" />
                          <span>{t('menu.SellLists')}</span>
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

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="border-t py-4 xl:hidden">
            <div className="flex flex-col gap-2">
              <Button variant="ghost" asChild className="justify-start">
                <Link href="/games" onClick={() => setMobileMenuOpen(false)}>
                  <Dices className="mr-2 h-4 w-4" />
                  {t('menu.Jeux')}
                </Link>
              </Button>
              <Button variant="ghost" asChild className="justify-start">
                <Link href="/events" onClick={() => setMobileMenuOpen(false)}>
                  <Calendar className="mr-2 h-4 w-4" />
                  {t('menu.Événements')}
                </Link>
              </Button>
              <Button variant="ghost" asChild className="justify-start">
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
                <>
                  <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">{t('menu.Collection')}</p>
                  <Button variant="ghost" asChild className="justify-start">
                    <Link href="/collection" onClick={() => setMobileMenuOpen(false)}>
                      <Library className="mr-2 h-4 w-4" />
                      {t('menu.Collection')}
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild className="justify-start">
                    <Link href="/wishlists" onClick={() => setMobileMenuOpen(false)}>
                      <Heart className="mr-2 h-4 w-4" />
                      {t('menu.Wishlists')}
                    </Link>
                  </Button>
                  <Button variant="ghost" asChild className="justify-start">
                    <Link href="/sell-lists" onClick={() => setMobileMenuOpen(false)}>
                      <Tag className="mr-2 h-4 w-4" />
                      {t('menu.SellLists')}
                    </Link>
                  </Button>
                </>
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
