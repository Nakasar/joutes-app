'use client';

import { useParams, useRouter } from "next/navigation";
import { joinEventAction } from "../../actions";
import { useEffect } from "react";
import { useSession } from "@/lib/auth-client";

export default function JoinPage() {
    const { eventId } = useParams<{ eventId: string }>();
    const router = useRouter();
    const session = useSession();

    useEffect(() => {
        if (!session?.data?.user) {
            router.push(`/login?redirect=/events/${eventId}/join`);
            return;
        }

        joinEventAction(eventId).then((result) => {
            if (result.success) {
                router.push(`/events/${eventId}?joined=true`);
            } else {
                router.push(`/events/${eventId}?error=${encodeURIComponent(result.error || "Erreur")}`);
            }
        }).catch(() => {
            router.push(`/events/${eventId}?error=${encodeURIComponent("Erreur")}`);
        });
    }, [eventId, session]);

    return (<div></div>);
}
