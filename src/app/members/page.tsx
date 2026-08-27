import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText, Search, Users } from "lucide-react";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { UserRoleBadge } from "@/components/ui/user-role-badge";
import { db } from "@/lib/db";
import { listMembersPage } from "@/lib/queries";
import { publicMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = publicMetadata({ title: "Members", description: "Meet the people building and sharing in the Teich community.", path: "/members" });

type MemberListItem = Awaited<ReturnType<typeof listMembersPage>>["items"][number];

function MemberCard({ member }: { member: MemberListItem }) {
  const activityCount = member._count.threads + member._count.replies;
  return (
    <Link
      className="card card-hover flex min-w-0 flex-col p-5"
      href={`/members/${member.id}`}
      aria-label={`View ${member.displayName}'s profile`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <Avatar src={member.imageUrl} name={member.displayName} className="!h-14 !w-14 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate font-extrabold">{member.displayName}</h3>
            <UserRoleBadge role={member.role} />
          </div>
          <p className="truncate text-sm font-semibold muted">@{member.username}</p>
        </div>
      </div>
      <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 muted">
        {member.bio || "This member has not added a bio yet."}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs muted" style={{ borderColor: "var(--line)" }}>
        <span className="flex items-center gap-1.5"><MessageSquareText size={14} aria-hidden /> {activityCount} public {activityCount === 1 ? "contribution" : "contributions"}</span>
        <span>Joined {format(member.createdAt, "MMM yyyy")}</span>
      </div>
    </Link>
  );
}

function MemberSection({ title, members }: { title: string; members: MemberListItem[] }) {
  if (!members.length) return null;
  return (
    <section className="mb-8" aria-labelledby={`member-section-${title.toLowerCase()}`}>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-xl font-black" id={`member-section-${title.toLowerCase()}`}>{title}</h2>
        <span className="pill">{members.length}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) => <MemberCard member={member} key={member.id} />)}
      </div>
    </section>
  );
}

export default async function MembersPage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ q?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim().slice(0, 80) ?? "";
  const [administratorPage, moderatorPage, memberPage, memberCount] = await Promise.all([
    listMembersPage(q, undefined, 50, "ADMIN"),
    listMembersPage(q, undefined, 50, "MODERATOR"),
    listMembersPage(q, params.cursor, 24, "MEMBER"),
    db.user.count({ where: { status: "ACTIVE" } }),
  ]);
  const visibleCount = administratorPage.items.length + moderatorPage.items.length + memberPage.items.length;
  const resultLabel = q
    ? `${visibleCount} ${visibleCount === 1 ? "match" : "matches"} on this page`
    : `${memberCount.toLocaleString()} active ${memberCount === 1 ? "member" : "members"}`;

  return (
    <div className="shell py-8 sm:py-10">
      <PageHeader
        eyebrow="Community directory"
        title="Meet the members"
        description="Find the people asking questions, sharing experiments, and helping Teich grow."
      />

      <form action="/members" className="card my-6 flex flex-col gap-3 p-4 sm:flex-row" role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 muted" size={17} aria-hidden />
          <input
            type="search"
            className="input !pl-10"
            name="q"
            defaultValue={q}
            placeholder="Search by name or username"
            aria-label="Search members"
          />
        </div>
        <button className="button button-primary" type="submit">Search</button>
        {q ? <Link className="button button-secondary" href="/members">Clear</Link> : null}
      </form>

      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold muted" aria-live="polite">{resultLabel}</p>
      </div>

      {visibleCount ? (
        <div>
          <MemberSection title="Administrators" members={administratorPage.items} />
          <MemberSection title="Moderators" members={moderatorPage.items} />
          <MemberSection title="Members" members={memberPage.items} />
        </div>
      ) : (
        <EmptyState
          icon={<Users size={24} aria-hidden />}
          title={q ? "No members found" : "No members yet"}
          description={q ? `No active members match “${q}”. Try another name or username.` : "The community directory is empty for now."}
          action={q ? <Link className="button button-secondary" href="/members">Clear search</Link> : undefined}
        />
      )}

      {memberPage.nextCursor ? (
        <div className="mt-5 text-center">
          <Link
            className="button button-secondary"
            href={{ pathname: "/members", query: { ...(q ? { q } : {}), cursor: memberPage.nextCursor } }}
          >
            More members
          </Link>
        </div>
      ) : null}
    </div>
  );
}
