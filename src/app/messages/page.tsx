import { permanentRedirect } from "next/navigation";

export default function MessagesPage() {
  permanentRedirect("/mail");
}
