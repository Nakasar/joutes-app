'use client';

import { useParams, useRouter } from "next/navigation";
import { joinEventAction } from "../../actions";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";
import { useTranslations } from "next-intl";

export default function JoinPage() {
    const { eventId } = useParams<{ eventId: string }>();
    const router = useRouter();
    const session = useSession();
    const t = useTranslations("EventJoin");

    useEffect(() => {
        if (session.isPending) {
            return;
        }
        if (!session?.data?.user) {
            router.push(`/login?redirect=/events/${eventId}/join`);
            return;
        }

        joinEventAction(eventId).then((result) => {
            if (result.success) {
                router.push(`/events/${eventId}?joined=true`);
            } else {
                router.push(`/events/${eventId}?error=${encodeURIComponent(result.error || t("errors.generic"))}`);
            }
        }).catch(() => {
            router.push(`/events/${eventId}?error=${encodeURIComponent(t("errors.generic"))}`);
        });
    }, [eventId, session, t, router]);

    return (
        <div>
            <p>{t("pending")}</p>
        </div>
    );
}
