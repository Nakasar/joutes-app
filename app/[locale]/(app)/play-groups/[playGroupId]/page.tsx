import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";

import { getPlayGroupById } from "@/lib/db/play-groups.ts";
import { readPlayGroupVisibility } from "@/lib/play-groups/access.ts";
import { PlayGroupScreenSkeleton } from "@/components/play-groups/PlayGroupSkeletons.tsx";

import PlayGroupShell from "./PlayGroupShell.tsx";
import HubView from "./HubView.tsx";
import SessionsView from "./sessions/SessionsView.tsx";
import AnnouncementsView from "./announcements/AnnouncementsView.tsx";
import ContentsView from "./contents/ContentsView.tsx";
import ContentEditorView from "./contents/ContentEditorView.tsx";
import ListsView from "./lists/ListsView.tsx";
import MembersView from "./members/MembersView.tsx";
import SettingsView from "./settings/SettingsView.tsx";
import ShowcaseView from "./showcase/ShowcaseView.tsx";
import ArticleView from "./showcase/ArticleView.tsx";
import { readGroupViewer } from "./group-data.ts";
import { readPlayGroupView, type PlayGroupView } from "./views.ts";

type GroupParams = Promise<{ playGroupId: string }>;
type GroupSearchParams = Promise<{ view?: string; contentId?: string; article?: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: GroupParams;
  searchParams: GroupSearchParams;
}): Promise<Metadata> {
  const [{ playGroupId }, search] = await Promise.all([params, searchParams]);

  // Le pilote Mongo touche à l'horloge en lisant le groupe, ce qu'un prérendu
  // ne sait pas figer, et les métadonnées s'exécutent hors de la frontière de
  // la page, avec leur propre lecture.
  await connection();

  const group = await getPlayGroupById(playGroupId);

  if (!group) {
    const t = await getTranslations("PlayGroups.hub");
    return { title: t("title") };
  }

  // Le même repli que l'aiguillage : un visiteur — un moteur d'indexation, un
  // aperçu de lien — reçoit la vitrine, et doit donc en recevoir le titre, la
  // description et l'image. Décider autrement ici donnerait « Établi du
  // groupe » à une page qui montre la vitrine.
  const viewer = await readGroupViewer(playGroupId);
  const view = viewer.isMember ? readPlayGroupView(search.view) : "showcase";

  // Un groupe privé garde sa vitrine ouverte à qui en a l'adresse — c'est ce
  // qui permet d'inviter quelqu'un à la regarder — mais demande aux moteurs de
  // ne pas l'indexer : un groupe retiré du rôle d'armes qui ressortirait d'une
  // recherche ne serait pas privé.
  const robots = readPlayGroupVisibility(group) === "private" ? { index: false, follow: false } : undefined;

  // La vitrine est la seule vue qui sorte du groupe : c'est la seule qui mérite
  // une description et une image sociale.
  if (view === "showcase") {
    const article = search.article
      ? group.options?.contents?.find((item) => item.id === search.article)
      : undefined;

    if (article) {
      return {
        title: article.title,
        description: article.summary,
        robots,
        openGraph: {
          title: article.title,
          description: article.summary,
          images: article.thumbnail ? [article.thumbnail] : [],
        },
      };
    }

    return {
      title: group.name,
      description: group.options?.theme?.tagline ?? group.description,
      robots,
      openGraph: {
        title: group.name,
        description: group.options?.theme?.tagline ?? group.description ?? undefined,
        images: group.options?.theme?.banner ? [group.options.theme.banner] : [],
      },
    };
  }

  // Un espace de traduction par vue, écrit en toutes lettres : `getTranslations`
  // veut un espace littéral pour vérifier la clé, et un espace calculé le
  // priverait de ce contrôle.
  const t = await getTranslations("PlayGroups.hub");

  switch (view) {
    case "sessions":
      return { title: t("sessions.metadataTitle", { group: group.name }) };
    case "announcements":
      return { title: t("announcements.metadataTitle", { group: group.name }) };
    case "contents":
      return { title: t("contents.metadataTitle", { group: group.name }) };
    case "lists":
      return { title: t("lists.metadataTitle", { group: group.name }) };
    case "members":
      return { title: t("members.metadataTitle", { group: group.name }) };
    case "settings":
      return { title: t("settings.metadataTitle", { group: group.name }) };
    default:
      return { title: t("metadataTitle", { group: group.name }) };
  }
}

/**
 * Toutes les vues d'un groupe, sur une seule route.
 *
 * Le rail choisit `?view=` ; la vitrine est la vue d'un visiteur, le reste est
 * réservé aux membres. Le pourquoi de ce regroupement est dans `views.ts` — en
 * deux mots : le plafond de 2048 entrées de routage d'un déploiement Vercel,
 * que huit segments multipliés par quatre langues faisaient sauter.
 */
export default function PlayGroupPage({
  params,
  searchParams,
}: {
  params: GroupParams;
  searchParams: GroupSearchParams;
}) {
  return (
    <Suspense
      fallback={
        <div className="px-4 py-6 lg:px-8">
          <PlayGroupScreenSkeleton />
        </div>
      }
    >
      <PlayGroupRouter params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PlayGroupRouter({
  params,
  searchParams,
}: {
  params: GroupParams;
  searchParams: GroupSearchParams;
}) {
  const [{ playGroupId }, search] = await Promise.all([params, searchParams]);
  const viewer = await readGroupViewer(playGroupId);

  // Un visiteur n'a qu'une vue, et c'est la vitrine : elle est faite pour lui.
  // Le rediriger vers une erreur serait absurde sur une page publique.
  const view: PlayGroupView = viewer.isMember ? readPlayGroupView(search.view) : "showcase";

  if (view === "showcase") {
    // La vitrine porte sa propre bannière et son accent, et se montre sans le
    // rail : un membre doit la voir exactement telle qu'un visiteur la reçoit.
    return search.article ? (
      <ArticleView playGroupId={playGroupId} contentId={search.article} />
    ) : (
      <ShowcaseView playGroupId={playGroupId} />
    );
  }

  return (
    <PlayGroupShell playGroupId={playGroupId} active={view}>
      <PlayGroupViewContent playGroupId={playGroupId} view={view} contentId={search.contentId} />
    </PlayGroupShell>
  );
}

function PlayGroupViewContent({
  playGroupId,
  view,
  contentId,
}: {
  playGroupId: string;
  view: PlayGroupView;
  contentId?: string;
}) {
  switch (view) {
    case "sessions":
      return <SessionsView playGroupId={playGroupId} />;
    case "announcements":
      return <AnnouncementsView playGroupId={playGroupId} />;
    case "contents":
      // Le même onglet porte la liste et l'écriture : `contentId` décide, et
      // `new` ouvre un contenu vierge.
      return contentId ? (
        <ContentEditorView playGroupId={playGroupId} contentId={contentId} />
      ) : (
        <ContentsView playGroupId={playGroupId} />
      );
    case "lists":
      return <ListsView playGroupId={playGroupId} />;
    case "members":
      return <MembersView playGroupId={playGroupId} />;
    case "settings":
      return <SettingsView playGroupId={playGroupId} />;
    default:
      return <HubView playGroupId={playGroupId} />;
  }
}
