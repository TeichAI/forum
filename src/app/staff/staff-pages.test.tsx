import { render, screen } from "@testing-library/react";
import { axe } from "jest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    requireModerator: fn(), requireAdmin: fn(), notFound: fn(),
    moderationCase: { count: fn(), findMany: fn(), findUnique: fn() },
    moderationAction: { findMany: fn() },
    thread: { count: fn(), findMany: fn(), findUnique: fn() },
    reply: { count: fn(), findMany: fn(), findUnique: fn() },
    user: { count: fn(), findMany: fn(), findUnique: fn() },
    category: { count: fn(), findMany: fn() }, tag: { count: fn(), findMany: fn() },
    mailEntry: { findUnique: fn(), findMany: fn() }, settings: fn(),
  };
});

vi.mock("@/lib/auth", () => ({ requireModerator: mocks.requireModerator, requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/db", () => ({ db: {
  moderationCase: mocks.moderationCase, moderationAction: mocks.moderationAction,
  thread: mocks.thread, reply: mocks.reply, user: mocks.user,
  category: mocks.category, tag: mocks.tag, mailEntry: mocks.mailEntry,
} }));
vi.mock("@/lib/moderation", () => ({ getModerationSettings: mocks.settings, canModerateRole: (actor: string, target: string) => target !== "ADMIN" && (actor === "ADMIN" || target === "MEMBER") }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/staff/staff-nav", () => ({ StaffNav: ({ role }: { role: string }) => <nav>{role} navigation</nav> }));
vi.mock("@/components/staff/action-form", () => ({ StaffActionForm: ({ children, className }: { children: React.ReactNode; className?: string }) => <form className={className}>{children}</form> }));
vi.mock("@/components/markdown", () => ({ Markdown: ({ children }: { children: string }) => <div>{children}</div> }));
vi.mock("@/actions/staff", () => ({
  addStaffNote: vi.fn(), claimCase: vi.fn(), closeCase: vi.fn(), moderateContent: vi.fn(), setCasePriority: vi.fn(), setMemberSuspension: vi.fn(),
  changeSpaceState: vi.fn(), saveSpace: vi.fn(), mergeTag: vi.fn(), renameTag: vi.fn(), saveModerationSettings: vi.fn(),
}));

import StaffLayout from "./layout";
import StaffOverviewPage from "./page";
import StaffAuditPage from "./audit/page";
import StaffContentPage from "./content/page";
import StaffMembersPage from "./members/page";
import StaffMemberPage from "./members/[id]/page";
import ReportsPage from "./reports/page";
import ReportCasePage from "./reports/[id]/page";
import StaffSpacesPage from "./spaces/page";
import StaffTagsPage from "./tags/page";
import ModerationSettingsPage from "./settings/moderation/page";

const now = new Date("2026-08-24T12:00:00Z");
const admin = { id: "admin", role: "ADMIN" as const, displayName: "Pond Admin" };
const member = { id: "member", clerkId: "clerk-member", username: "pond_member", displayName: "Pond Member", role: "MEMBER" as const, status: "ACTIVE" as const, email: "member@example.test", imageUrl: null, bio: "A member", suspendedUntil: null, createdAt: now };
const settings = { reportReasons: ["Spam", "Other"], suspensionDurationsDays: [1, 7], actionReasons: ["Spam", "Other"] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireModerator.mockResolvedValue(admin);
  mocks.requireAdmin.mockResolvedValue(admin);
  mocks.notFound.mockImplementation(() => { throw new Error("NEXT_NOT_FOUND"); });
  mocks.settings.mockResolvedValue(settings);
  mocks.moderationCase.count.mockResolvedValue(2);
  mocks.thread.count.mockResolvedValue(1);
  mocks.reply.count.mockResolvedValue(1);
  mocks.user.count.mockResolvedValue(1);
  mocks.category.count.mockResolvedValue(3);
  mocks.tag.count.mockResolvedValue(4);
  mocks.moderationAction.findMany.mockResolvedValue([]);
});

describe("staff console pages", () => {
  it("renders the shared shell and workload dashboard", async () => {
    const layout = render(await StaffLayout({ children: <p>Staff content</p> }));
    expect(screen.getByRole("heading", { name: "Community operations" })).toBeInTheDocument();
    expect(screen.getByText("ADMIN navigation")).toBeInTheDocument();
    layout.unmount();
    render(await StaffOverviewPage());
    expect(screen.getByRole("heading", { name: "Staff workload" })).toBeInTheDocument();
    expect(screen.getByText("Active cases")).toBeInTheDocument();
    expect(screen.getByText("Active spaces")).toBeInTheDocument();
    screen.getByText("Active spaces").closest("a");
  });

  it("renders the moderator dashboard without administration statistics and handles empty activity", async () => {
    mocks.requireModerator.mockResolvedValue({ id: "moderator", role: "MODERATOR" });
    render(await StaffOverviewPage());
    expect(screen.queryByText("Active spaces")).not.toBeInTheDocument();
    expect(screen.getByText("No staff activity yet.")).toBeInTheDocument();
    expect(mocks.moderationAction.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: { in: expect.not.arrayContaining(["CREATE_SPACE", "MERGE_TAG"]) } },
    }));
  });

  it("renders filtered report, member, content, and audit listings", async () => {
    mocks.moderationCase.findMany.mockResolvedValue([{ id: "case", targetType: "THREAD", status: "OPEN", priority: "HIGH", createdAt: now, assignedTo: null, reports: [{ reason: "Spam", reporter: { username: "pond_member" } }], _count: { reports: 1 } }]);
    let view = render(await ReportsPage({ searchParams: Promise.resolve({ status: "OPEN", priority: "HIGH" }) }));
    expect(screen.getByRole("link", { name: /thread report/i })).toHaveAttribute("href", "/staff/reports/case");
    view.unmount();

    mocks.user.findMany.mockResolvedValue([member]);
    view = render(await StaffMembersPage({ searchParams: Promise.resolve({ q: "pond" }) }));
    expect(screen.getByRole("link", { name: /Pond Member/ })).toHaveAttribute("href", "/staff/members/member");
    view.unmount();

    mocks.thread.findMany.mockResolvedValue([{ id: "thread", slug: "topic", title: "Reported topic", body: "Body", status: "HIDDEN", author: { username: "pond_member" }, category: { name: "General" }, createdAt: now }]);
    mocks.reply.findMany.mockResolvedValue([]);
    view = render(await StaffContentPage({ searchParams: Promise.resolve({ status: "HIDDEN" }) }));
    expect(screen.getByText("Reported topic")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
    view.unmount();

    mocks.moderationAction.findMany.mockResolvedValue([{ id: "action", type: "HIDE", targetType: "THREAD", targetId: "thread", reason: "Spam", createdAt: now, moderator: { displayName: "Pond Admin" } }]);
    render(await StaffAuditPage({ searchParams: Promise.resolve({ q: "Spam" }) }));
    expect(screen.getByText("Spam")).toBeInTheDocument();
  });

  it("renders report and member detail workflows with trusted records", async () => {
    mocks.moderationCase.findUnique.mockResolvedValue({
      id: "case", targetType: "THREAD", targetId: "thread", status: "IN_REVIEW", priority: "URGENT", assignedToId: admin.id,
      assignedTo: admin, resolution: null, reports: [{ id: "report", reason: "Spam", details: "Repeated links", createdAt: now, reporter: member }],
      notes: [{ id: "note", body: "Prior warning", createdAt: now, author: admin }], actions: [],
    });
    mocks.thread.findUnique.mockResolvedValue({ id: "thread", slug: "topic", title: "Reported topic", body: "Body", status: "PUBLISHED", isLocked: false, isPinned: false, author: member, category: { name: "General" } });
    const view = render(await ReportCasePage({ params: Promise.resolve({ id: "case" }) }));
    expect(screen.getByText("Reported topic")).toBeInTheDocument();
    expect(screen.getByText("Repeated links")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
    view.unmount();

    mocks.user.findUnique.mockResolvedValue({ ...member, _count: { threads: 2, replies: 3, reports: 1 }, receivedStaffNotes: [], moderationReceived: [] });
    render(await StaffMemberPage({ params: Promise.resolve({ id: member.id }) }));
    expect(screen.getByRole("heading", { name: "Pond Member" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suspend member" })).toBeInTheDocument();
  });

  it("renders reply, member, and limited private-Mail case targets plus closed decisions", async () => {
    const baseCase = { id: "case", status: "RESOLVED", priority: "NORMAL", assignedToId: admin.id, assignedTo: admin, resolution: "Done", reports: [], notes: [], actions: [] };
    mocks.moderationCase.findUnique.mockResolvedValue({ ...baseCase, targetType: "REPLY", targetId: "reply" });
    mocks.reply.findUnique.mockResolvedValue({ id: "reply", body: "Reply body", status: "HIDDEN", author: member, thread: { slug: "topic", title: "Topic" } });
    let view = render(await ReportCasePage({ params: Promise.resolve({ id: "case" }) }));
    expect(screen.getByText("Reply body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen case" })).toBeInTheDocument();
    view.unmount();

    mocks.moderationCase.findUnique.mockResolvedValue({ ...baseCase, targetType: "USER", targetId: member.id, status: "OPEN" });
    mocks.user.findUnique.mockResolvedValue(member);
    view = render(await ReportCasePage({ params: Promise.resolve({ id: "case" }) }));
    expect(screen.getByText("A member")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Member action" })).toBeInTheDocument();
    view.unmount();

    mocks.moderationCase.findUnique.mockResolvedValue({ ...baseCase, targetType: "MAIL_ENTRY", targetId: "message", status: "OPEN" });
    mocks.mailEntry.findUnique.mockResolvedValue({ id: "message", threadId: "thread", body: "Reported private Mail", createdAt: now, author: { username: "pond_member" } });
    mocks.mailEntry.findMany.mockResolvedValueOnce([{ id: "before", body: "Before", createdAt: new Date(now.getTime() - 1), author: { username: "other" } }]).mockResolvedValueOnce([{ id: "after", body: "After", createdAt: new Date(now.getTime() + 1), author: { username: "other" } }]);
    render(await ReportCasePage({ params: Promise.resolve({ id: "case" }) }));
    expect(screen.getByText("Reported private Mail")).toBeInTheDocument();
    expect(screen.getByText(/limited to two mail entries/)).toBeInTheDocument();
  });

  it("renders empty list states and deleted content without moderation controls", async () => {
    mocks.moderationCase.findMany.mockResolvedValue([]);
    let view = render(await ReportsPage({ searchParams: Promise.resolve({ status: "invalid", page: "0" }) }));
    expect(screen.getByText("No cases match these filters.")).toBeInTheDocument();
    view.unmount();
    mocks.user.findMany.mockResolvedValue([]);
    view = render(await StaffMembersPage({ searchParams: Promise.resolve({ status: "invalid" }) }));
    expect(screen.getByText("No members match these filters.")).toBeInTheDocument();
    view.unmount();
    mocks.thread.findMany.mockResolvedValue([{ id: "thread", slug: "gone", title: "Deleted topic", body: "Gone", status: "DELETED", author: { username: "member" }, category: { name: "General" }, createdAt: now }]);
    mocks.reply.findMany.mockResolvedValue([]);
    render(await StaffContentPage({ searchParams: Promise.resolve({ type: "THREAD", status: "DELETED" }) }));
    expect(screen.getByText("Deleted topic")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("normalizes malformed report pages and clamps requests past the final page", async () => {
    mocks.moderationCase.count.mockResolvedValue(80);
    mocks.moderationCase.findMany.mockResolvedValue([]);
    let view = render(await ReportsPage({ searchParams: Promise.resolve({ page: "99" }) }));
    expect(screen.getByText("Page 4 of 4")).toBeInTheDocument();
    expect(mocks.moderationCase.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 75, take: 26 }));
    view.unmount();

    view = render(await ReportsPage({ searchParams: Promise.resolve({ page: "2.9" }) }));
    expect(screen.getByText("Page 2 of 4")).toBeInTheDocument();
    expect(mocks.moderationCase.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 25 }));
    view.unmount();

    render(await ReportsPage({ searchParams: Promise.resolve({ page: "Infinity" }) }));
    expect(screen.getByText("Page 1 of 4")).toBeInTheDocument();
    expect(mocks.moderationCase.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ skip: 0 }));
  });

  it("hides member controls for deleted and role-protected accounts", async () => {
    const detail = { ...member, status: "DELETED" as const, _count: { threads: 0, replies: 0, reports: 0 }, receivedStaffNotes: [], moderationReceived: [] };
    mocks.user.findUnique.mockResolvedValue(detail);
    let view = render(await StaffMemberPage({ params: Promise.resolve({ id: member.id }) }));
    expect(screen.queryByRole("button", { name: /suspend member/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add private note" })).not.toBeInTheDocument();
    expect(screen.getByText(/deleted and cannot be moderated or reactivated/i)).toBeInTheDocument();
    view.unmount();

    mocks.requireModerator.mockResolvedValue({ id: "moderator", role: "MODERATOR" });
    mocks.moderationCase.findUnique.mockResolvedValue({
      id: "case", targetType: "USER", targetId: "staff", status: "OPEN", priority: "NORMAL",
      assignedToId: null, assignedTo: null, resolution: null, reports: [], notes: [], actions: [],
    });
    mocks.user.findUnique.mockResolvedValue({ ...member, id: "staff", role: "MODERATOR", status: "ACTIVE" });
    view = render(await ReportCasePage({ params: Promise.resolve({ id: "case" }) }));
    expect(screen.queryByRole("heading", { name: "Member action" })).not.toBeInTheDocument();
    expect(screen.getByText(/protected by the role hierarchy/i)).toBeInTheDocument();
    view.unmount();

    mocks.user.findUnique.mockResolvedValue({ ...member, id: "deleted", status: "DELETED" });
    mocks.moderationCase.findUnique.mockResolvedValue({
      id: "case", targetType: "USER", targetId: "deleted", status: "OPEN", priority: "NORMAL",
      assignedToId: null, assignedTo: null, resolution: null, reports: [], notes: [], actions: [],
    });
    render(await ReportCasePage({ params: Promise.resolve({ id: "case" }) }));
    expect(screen.queryByRole("heading", { name: "Member action" })).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations on representative staff pages", async () => {
    mocks.moderationCase.findMany.mockResolvedValue([]);
    let view = render(await ReportsPage({ searchParams: Promise.resolve({}) }));
    expect(await axe(view.container)).toHaveNoViolations();
    view.unmount();

    mocks.thread.findMany.mockResolvedValue([{ id: "thread", slug: "topic", title: "Review topic", body: "Body", status: "PUBLISHED", author: { username: "pond_member" }, category: { name: "General" }, createdAt: now }]);
    mocks.reply.findMany.mockResolvedValue([]);
    view = render(await StaffContentPage({ searchParams: Promise.resolve({}) }));
    expect(await axe(view.container)).toHaveNoViolations();
    view.unmount();

    mocks.category.findMany.mockResolvedValue([{ id: "space", name: "General", slug: "general", description: "Talk", color: "#336699", postingPolicy: "OPEN", position: 0, archivedAt: null, _count: { threads: 2 } }]);
    view = render(await StaffSpacesPage());
    expect(await axe(view.container)).toHaveNoViolations();
  });

  it("renders every administrator management module", async () => {
    mocks.category.findMany.mockResolvedValue([{ id: "space", name: "General", slug: "general", description: "Talk", color: "#336699", postingPolicy: "OPEN", position: 0, archivedAt: null, _count: { threads: 2 } }]);
    let view = render(await StaffSpacesPage());
    expect(screen.getByRole("heading", { name: "Spaces" })).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    view.unmount();

    mocks.category.findMany.mockResolvedValue([{ id: "space", name: "Archive", slug: "archive", description: "Old", color: "#336699", postingPolicy: "OPEN", position: 0, archivedAt: now, _count: { threads: 0 } }]);
    view = render(await StaffSpacesPage());
    expect(screen.getByRole("button", { name: "Restore space" })).toBeInTheDocument();
    view.unmount();

    mocks.tag.findMany.mockResolvedValue([{ id: "tag", name: "Testing", slug: "testing", _count: { threads: 2, aliases: 1 } }]);
    view = render(await StaffTagsPage({ searchParams: Promise.resolve({ q: "test" }) }));
    expect(screen.getByText("#Testing")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    view.unmount();

    render(await ModerationSettingsPage());
    expect(screen.getByRole("heading", { name: "Moderation presets" })).toBeInTheDocument();
    expect(screen.getByLabelText("Report reasons")).toHaveValue("Spam\nOther");
  });
});
