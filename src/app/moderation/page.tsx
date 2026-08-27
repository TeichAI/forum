import { redirect } from "next/navigation";
import { requireModerator } from "@/lib/auth";
import { privateMetadata } from "@/lib/metadata";

export const metadata = privateMetadata("Moderation");

export default async function ModerationRedirectPage() {
  await requireModerator();
  redirect("/staff/reports");
}
