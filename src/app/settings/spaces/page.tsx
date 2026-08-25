import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function SpaceSettingsRedirectPage() {
  await requireAdmin();
  redirect("/staff/spaces");
}
