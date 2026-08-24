import type { ClerkRole } from "@/lib/roles";

declare global {
  interface UserPublicMetadata {
    role?: ClerkRole;
  }

  interface CustomJwtSessionClaims {
    forum_role?: ClerkRole;
  }
}

export {};
