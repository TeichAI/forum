import { SpacePostingPolicyForm } from "@/components/account/space-posting-policy-form";
import { SPACE_POSTING_POLICY_OPTIONS } from "@/components/forum/space-posting-policy";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SpaceSettingsPage() {
  await requireAdmin();
  const categories = await db.category.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      postingPolicy: true,
    },
  });

  return (
    <div className="shell max-w-4xl py-9">
      <div className="eyebrow">Administration</div>
      <h1 className="mt-1 text-3xl font-black">Space settings</h1>
      <p className="mt-2 max-w-2xl leading-7 muted">
        Choose who can start discussions and comment in each space. Changes take effect immediately, including on existing discussions.
      </p>

      <section className="card mt-7 p-5 sm:p-6" aria-labelledby="posting-policy-guide-heading">
        <h2 id="posting-policy-guide-heading" className="text-lg font-black">Posting permissions</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {SPACE_POSTING_POLICY_OPTIONS.map((option) => (
            <div key={option.value}>
              <dt className="text-sm font-extrabold">{option.label}</dt>
              <dd className="mt-1 text-sm leading-6 muted">{option.description}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-6 space-y-4">
        {categories.map((category) => <SpacePostingPolicyForm key={category.id} category={category} />)}
        {!categories.length && (
          <div className="card p-10 text-center">
            <h2 className="font-bold">No spaces yet</h2>
            <p className="mt-1 muted">Create a space from the forum home page, then manage its posting permissions here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
