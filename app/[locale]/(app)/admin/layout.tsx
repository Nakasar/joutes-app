import { requireAdmin } from "@/lib/middleware/admin.ts";
import { countPendingReportedContents } from "@/lib/db/reports.ts";
import { countLairsNeedingAttention } from "@/lib/db/lairs.ts";
import { AdminSidebar } from "./_components/AdminSidebar.tsx";
import { AdminCommandPalette } from "./_components/AdminCommandPalette.tsx";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Administration",
  robots: { index: false, follow: false },
};

/**
 * La porte reste devant, et elle couvre toute l'administration.
 *
 * `requireAdmin()` lit la session : hors frontière, elle bloquait le prérendu de
 * la zone entière. Sous frontière, elle laisse une coquille — mais alors
 * `{children}` passe derrière elle, et les pages n'ajoutent rien à cette
 * coquille. C'est le prix assumé : personne ne doit voir l'ombre d'un écran
 * d'administration avant que la porte ait répondu, pas même sa mise en page.
 *
 * Ce qui reste devant est donc le fond et la silhouette du menu.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-muted/40 lg:flex-row">
      <Suspense fallback={<AdminChromeSkeleton />}>
        <AdminChrome>{children}</AdminChrome>
      </Suspense>
    </div>
  );
}

/** Le menu, le temps que la porte réponde. */
function AdminChromeSkeleton() {
  return (
    <div role="status" aria-busy="true" className="contents">
      <span className="sr-only">Vérification des droits d&apos;administration…</span>
      <div className="h-[61px] border-b border-border bg-card lg:hidden" aria-hidden />
      <div className="hidden w-60 shrink-0 border-r border-border bg-card px-5 py-6 lg:block" aria-hidden>
        <div className="flex animate-pulse flex-col gap-4">
          {[72, 96, 88, 64, 104, 80, 72, 96].map((width, index) => (
            <div key={index} className="h-4 rounded bg-muted" style={{ width }} />
          ))}
        </div>
      </div>
    </div>
  );
}

async function AdminChrome({ children }: { children: React.ReactNode }) {
  try {
    await requireAdmin();
  } catch {
    redirect("/");
  }

  // Les compteurs du menu : ce qui attend une décision, visible depuis
  // n'importe quelle page de l'administration.
  const [reports, lairs] = await Promise.all([
    countPendingReportedContents(),
    countLairsNeedingAttention(),
  ]);

  return (
    <>
      <AdminSidebar badges={{ reports, lairs }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5 sm:px-8">
          <AdminCommandPalette />
        </div>
        <main className="flex-1">{children}</main>
      </div>
    </>
  );
}
