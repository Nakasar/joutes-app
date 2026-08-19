import PlayGroupMembersClient from "@/components/play-groups/PlayGroupMembersClient.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function PlayGroupMembersPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8">
      <PlayGroupMembersClient />
    </div>
  );
}

