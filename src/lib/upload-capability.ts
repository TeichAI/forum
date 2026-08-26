import "server-only";

import { optionalRuntimeSecret } from "@/lib/env";

export function uploadsEnabled() {
  return Boolean(optionalRuntimeSecret("UPLOADTHING_TOKEN"));
}
