import { permanentRedirect } from "next/navigation";
import { privateMetadata } from "@/lib/metadata";

export const metadata = privateMetadata("Message");

export default function LegacyConversationPage() {
  permanentRedirect("/mail");
}
