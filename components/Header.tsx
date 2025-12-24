"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import Image from "next/image";
import {Menu, Calendar, MapPin, User, LogOut, Shield, GamepadIcon, Trophy, Dices, TrophyIcon} from "lucide-react";
import { isAdmin } from "@/lib/config/admins";
import { Button } from "@/components/ui/button";
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

export default function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { data: session, isPending } = useSession();

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
          <NavigationMenu className="hidden lg:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                  <Link href="/games">
                    <Dices className="mr-2 h-4 w-4" />
                    Jeux
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                  <Link href="/events">
                    <Calendar className="mr-2 h-4 w-4" />
                    Événements
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                  <Link href="/lairs">
                    <MapPin className="mr-2 h-4 w-4" />
                    Lieux
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                  <Link href="/leagues">
                    <Trophy className="mr-2 h-4 w-4" />
                    Ligues
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
              {session && (
                <NavigationMenuItem>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                    <Link href="/game-matches">
                      <GamepadIcon className="mr-2 h-4 w-4" />
                      Parties
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
              {session && isAdmin(session.user.email) && (
                <NavigationMenuItem>
                  <NavigationMenuLink className={navigationMenuTriggerStyle()} asChild>
                    <Link href="/admin">
                      <Shield className="mr-2 h-4 w-4" />
                      Administration
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              )}
            </NavigationMenuList>
          </NavigationMenu>

          {/* User Menu (Desktop) */}
          <div className="hidden lg:flex md:items-center">
            {isPending ? (
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : session ? (
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
                  <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/account" className="flex w-full cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      <span>Mon Profil</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/account/achievements" className="flex w-full cursor-pointer">
                      <TrophyIcon className="mr-2 h-4 w-4" />
                      <span>Succès</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Déconnexion</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild>
                <Link href="/login">Se connecter</Link>
              </Button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="flex items-center gap-2 lg:hidden">
            {!isPending && session && (
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
                      <span>Mon Profil</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Déconnexion</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {!isPending && !session && (
              <Button size="sm" asChild>
                <Link href="/login">Connexion</Link>
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
          <div className="border-t py-4 lg:hidden">
            <div className="flex flex-col gap-2">
              <Button variant="ghost" asChild className="justify-start">
                <Link href="/games" onClick={() => setMobileMenuOpen(false)}>
                  <Dices className="mr-2 h-4 w-4" />
                  Jeux
                </Link>
              </Button>
              <Button variant="ghost" asChild className="justify-start">
                <Link href="/events" onClick={() => setMobileMenuOpen(false)}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Événements
                </Link>
              </Button>
              <Button variant="ghost" asChild className="justify-start">
                <Link href="/lairs" onClick={() => setMobileMenuOpen(false)}>
                  <MapPin className="mr-2 h-4 w-4" />
                  Lieux
                </Link>
              </Button>
              <Button variant="ghost" asChild className="justify-start">
                <Link href="/leagues" onClick={() => setMobileMenuOpen(false)}>
                  <Trophy className="mr-2 h-4 w-4" />
                  Ligues
                </Link>
              </Button>
              {session && (
                <Button variant="ghost" asChild className="justify-start">
                  <Link href="/game-matches" onClick={() => setMobileMenuOpen(false)}>
                    <GamepadIcon className="mr-2 h-4 w-4" />
                    Parties
                  </Link>
                </Button>
              )}
              {session && isAdmin(session.user.email) && (
                <Button variant="ghost" asChild className="justify-start">
                  <Link href="/admin" onClick={() => setMobileMenuOpen(false)}>
                    <Shield className="mr-2 h-4 w-4" />
                    Administration
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
