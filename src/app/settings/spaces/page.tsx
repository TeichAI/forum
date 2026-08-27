import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { privateMetadata } from "@/lib/metadata";

export const metadata = privateMetadata("Space settings");

export default async function SpaceSettingsRedirectPage() {
  await requireAdmin();
  redirect("/staff/spaces");
}
