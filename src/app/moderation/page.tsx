import { redirect } from "next/navigation";
import { requireModerator } from "@/lib/auth";

export default async function ModerationRedirectPage() {
  await requireModerator();
  redirect("/staff/reports");
}
