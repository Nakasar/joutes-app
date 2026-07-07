import {Button} from "@/components/ui/button";
import Link from "next/link";
import {getGameBySlugOrId} from "@/lib/db/games";
import {getTranslations} from "next-intl/server";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {ArrowDownSquareIcon} from "lucide-react";

export async function GameToolsNavBar({gameSlug, currentTab}: { gameSlug: string; currentTab?: string }) {
  const t = await getTranslations('Games.nav');

  const game = await getGameBySlugOrId(gameSlug);

  if (!game) {
    return (<></>);
  }

  return (
    <>
      <div className="flex-row flex-wrap gap-2 justify-end hidden lg:flex">
        {game.features?.cards && currentTab !== 'cards' &&
          <Button variant="secondary" asChild>
            <Link href={`/games/${gameSlug}/cards`} className="hover:underline">
              {t("cards")}
            </Link>
          </Button>
        }
        {game.features?.rules && currentTab !== 'rules' &&
          <Button variant="secondary" asChild>
            <Link href={`/games/${gameSlug}/rules`} className="hover:underline">
              {t("rules")}
            </Link>
          </Button>
        }
        {game.features?.policies && currentTab !== 'policies' &&
          <Button variant="secondary" asChild>
            <Link href={`/games/${gameSlug}/policies`} className="hover:underline">
              {t("policies")}
            </Link>
          </Button>
        }
        {game.features?.deckChecker && currentTab !== 'deckChecker' &&
          <Button variant="secondary" asChild>
            <Link href={`/games/${gameSlug}/deck-checker`} className=" hover:underline">
              {t("deckChecker")}
            </Link>
          </Button>
        }
        {game.features?.cards && currentTab !== 'collection' &&
          <Button variant="secondary" asChild>
            <Link href={`/collection/${gameSlug}`} className="hover:underline">
              {t("collection")}
            </Link>
          </Button>
        }
      </div>
      <div className="lg:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary">
              {t(currentTab ?? 'tools')}
              <ArrowDownSquareIcon/>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {game.features?.cards &&
              <DropdownMenuItem asChild>
                <Link href={`/games/${gameSlug}/cards`}>
                  {t("cards")}
                </Link>
              </DropdownMenuItem>
            }
            {game.features?.rules &&
              <DropdownMenuItem asChild>
                <Link href={`/games/${gameSlug}/rules`}>
                  {t("rules")}
                </Link>
              </DropdownMenuItem>
            }
            {game.features?.policies &&
              <DropdownMenuItem asChild>
                <Link href={`/games/${gameSlug}/policies`}>
                  {t("policies")}
                </Link>
              </DropdownMenuItem>
            }
            {game.features?.deckChecker &&
              <DropdownMenuItem asChild>
                <Link href={`/games/${gameSlug}/deck-checker`}>
                  {t("deckChecker")}
                </Link>
              </DropdownMenuItem>
            }
            {game.features?.cards &&
              <DropdownMenuItem asChild>
                <Link href={`/collection/${gameSlug}`}>
                  {t("collection")}
                </Link>
              </DropdownMenuItem>
            }
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}