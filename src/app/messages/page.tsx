import { permanentRedirect } from "next/navigation";
import { privateMetadata } from "@/lib/metadata";

export const metadata = privateMetadata("Messages");

export default function MessagesPage() {
  permanentRedirect("/mail");
}
