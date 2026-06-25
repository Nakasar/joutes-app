import PlayGroupMembersClient from "@/components/play-groups/PlayGroupMembersClient";

export const dynamic = "force-dynamic";

export default function PlayGroupMembersPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <PlayGroupMembersClient />
    </div>
  );
}

