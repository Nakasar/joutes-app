import { Suspense } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { AtSign, UserPlus } from "lucide-react";

import { getPendingInvitationsForPlayGroup, getPlayGroupById } from "@/lib/db/play-groups.ts";
import { readPlayGroupAttendance } from "@/lib/db/play-group-sessions.ts";
import { getUsersByIds } from "@/lib/db/users.ts";

import { InvitationActions, InviteMemberForm, MemberRoleActions } from "./MemberActions.tsx";
import { readGroupMembers, requirePlayGroup, requirePlayGroupMember } from "../group-data.ts";

/**
 * Les membres du groupe : qui en est, à quel titre, et à quel point il vient.
 *
 * La présence est dérivée des réponses aux sessions passées — aucun compteur
 * n'est tenu à part. Un groupe qui n'a pas encore joué n'affiche donc pas de
 * jauge plutôt qu'une jauge à zéro, qui accuserait tout le monde.
 */
export default async function MembersView({ playGroupId }: { playGroupId: string }) {
  const [group, viewer, members, attendance, invitations, t, locale] = await Promise.all([
    requirePlayGroup(playGroupId),
    requirePlayGroupMember(playGroupId),
    readGroupMembers(playGroupId),
    readPlayGroupAttendance(playGroupId),
    getPendingInvitationsForPlayGroup(playGroupId),
    getTranslations("PlayGroups.hub.members"),
    getLocale(),
  ]);

  return (
    <div className="grid gap-[26px] xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("summary", { count: members.length, invitations: invitations.length })}
          </p>
        </header>

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="hidden grid-cols-[1.6fr_1fr_1.1fr_auto] gap-3 border-b px-5 py-3 font-mono text-[11px] tracking-[.08em] text-muted-foreground uppercase sm:grid">
            <span>{t("columnMember")}</span>
            <span>{t("columnRole")}</span>
            <span>{t("columnAttendance")}</span>
            <span />
          </div>

          {members.map((member) => {
            const attended = attendance.attendedByUserId[member.userId] ?? 0;
            // Le dénominateur ne compte que les sessions tenues depuis l'arrivée
            // du membre : juger un nouveau venu sur les soirées d'avant son
            // entrée le montrerait absent de tout ce à quoi il ne pouvait pas
            // venir.
            const eligible = attendance.sessionDates.filter((date) => date >= member.joinedAt).length;
            const ratio = eligible > 0 ? Math.min(1, attended / eligible) : 0;
            const joined = DateTime.fromISO(member.joinedAt).setLocale(locale);

            // Le fondateur n'est ni promu ni retiré : c'est lui qui répond du
            // groupe, et le rétrograder laisserait le groupe sans personne pour
            // le supprimer.
            const isOwner = member.role === "owner";
            const canPromote = viewer.role === "owner" && !isOwner;
            const canRemove = !isOwner && (viewer.role === "owner" || (viewer.canManage && member.role === "member"));

            return (
              <div
                key={member.userId}
                className="grid gap-3 border-b px-5 py-3.5 last:border-b-0 sm:grid-cols-[1.6fr_1fr_1.1fr_auto] sm:items-center"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {member.avatar ? (
                    <span className="size-[34px] shrink-0 overflow-hidden rounded-full">
                      {/* `next/image` refuserait l'hôte : les avatars viennent
                          de Discord et d'ailleurs, comme partout dans le site. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={member.avatar} alt="" className="size-full object-cover" />
                    </span>
                  ) : (
                    <span
                      aria-hidden
                      className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--group-accent-16)] text-[11px] font-semibold text-[var(--group-accent-text)]"
                    >
                      {member.displayName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{member.displayName}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {[member.username ? `@${member.username}` : null, joined.isValid ? t("since", { year: joined.year }) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>

                <div>
                  <span
                    className={
                      isOwner
                        ? "rounded-[5px] bg-[var(--group-accent-16)] px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-[var(--group-accent-text)] uppercase"
                        : "rounded-[5px] border px-1.5 py-0.5 font-mono text-[10px] tracking-[.08em] text-muted-foreground uppercase"
                    }
                  >
                    {t(`role.${member.role}`)}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  {eligible > 0 ? (
                    <>
                      <span className="h-[5px] flex-1 overflow-hidden rounded-[3px] bg-muted">
                        <span
                          className="block h-full rounded-[3px] bg-[var(--group-accent)]"
                          style={{ width: `${Math.round(ratio * 100)}%` }}
                        />
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">{attended}</span>
                    </>
                  ) : (
                    <span className="font-mono text-[11px] text-muted-foreground">{t("noAttendanceYet")}</span>
                  )}
                </div>

                <MemberRoleActions
                  playGroupId={playGroupId}
                  memberId={member.userId}
                  role={member.role}
                  canPromote={canPromote}
                  canRemove={canRemove}
                />
              </div>
            );
          })}
        </div>

        {invitations.length > 0 && (
          <Suspense fallback={null}>
            <PendingInvitations
              playGroupId={playGroupId}
              invitations={invitations}
              canManage={viewer.canManage}
            />
          </Suspense>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <div className="flex flex-wrap items-center gap-2.5">
            <UserPlus className="size-[18px] shrink-0 text-[var(--group-accent-text)]" aria-hidden />
            <h2 className="text-base font-bold">{t("howToJoinTitle")}</h2>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("howToJoin")}</p>
          <InviteMemberForm playGroupId={playGroupId} canInvite={viewer.canManage} />
        </section>

        <section className="flex flex-col gap-2.5 rounded-xl border bg-card p-5">
          <h2 className="text-base font-bold">{t("rolesTitle")}</h2>
          <p className="text-[13px] text-muted-foreground">
            <strong className="font-semibold text-[var(--group-accent-text)]">{t("role.owner")}</strong>
            {" — "}
            {t("roleOwnerHint")}
          </p>
          <p className="text-[13px] text-muted-foreground">
            <strong className="font-semibold text-foreground">{t("role.admin")}</strong>
            {" — "}
            {t("roleAdminHint")}
          </p>
          <p className="text-[13px] text-muted-foreground">
            <strong className="font-semibold text-foreground">{t("role.member")}</strong>
            {" — "}
            {t("roleMemberHint")}
          </p>
        </section>
      </aside>
    </div>
  );
}

/** Les invitations en attente — on ne rejoint que sur invitation d'un admin. */
async function PendingInvitations({
  playGroupId,
  invitations,
  canManage,
}: {
  playGroupId: string;
  invitations: Awaited<ReturnType<typeof getPendingInvitationsForPlayGroup>>;
  canManage: boolean;
}) {
  const [users, t, locale] = await Promise.all([
    getUsersByIds(invitations.map((invitation) => invitation.invitedUserId)),
    getTranslations("PlayGroups.hub.members"),
    getLocale(),
  ]);

  const userById = new Map(users.map((user) => [user.id, user]));

  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="font-mono text-[11px] tracking-[.1em] text-muted-foreground uppercase">
        {t("pendingInvitations")}
      </h2>
      <p className="text-[13px] text-muted-foreground">{t("invitationOnly")}</p>

      {invitations.map((invitation) => {
        const user = userById.get(invitation.invitedUserId);
        const name = user?.username ? `@${user.username}` : (user?.displayName ?? invitation.invitedUserId);
        const created = DateTime.fromISO(invitation.createdAt).setLocale(locale);

        return (
          <div
            key={invitation.id}
            className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-card/60 px-4 py-3"
          >
            <AtSign className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name}</p>
              {created.isValid && (
                <p className="font-mono text-[11px] text-muted-foreground">
                  {t("invitedOn", { date: created.toFormat("d LLLL") })}
                </p>
              )}
            </div>
            {canManage && <InvitationActions playGroupId={playGroupId} invitationId={invitation.id} />}
          </div>
        );
      })}
    </section>
  );
}
