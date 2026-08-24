"use client";

import Link from "next/link";
import { useClerk, useSignIn, useSignUp } from "@clerk/nextjs";
import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FormAlert } from "./auth-controls";
import { authFormUrl, clerkErrorMessage, safeRedirect, type AuthFormOrigin } from "./auth-utils";

export function SsoCallback({ redirectUrl, origin }: { redirectUrl: string; origin: AuthFormOrigin }) {
  const clerk = useClerk();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const router = useRouter();
  const started = useRef(false);
  const [localError, setLocalError] = useState("");
  const retryHref = authFormUrl(origin, redirectUrl);

  useEffect(() => {
    if (!clerk.loaded || started.current) return;
    started.current = true;

    const navigateToApp = ({ decorateUrl }: { decorateUrl: (url: string) => string }) => {
      router.replace(safeRedirect(decorateUrl(redirectUrl)));
    };

    const finishSignIn = async () => {
      const { error } = await signIn.finalize({ navigate: navigateToApp });
      if (error) throw error;
    };

    const finishSignUp = async () => {
      const { error } = await signUp.finalize({ navigate: navigateToApp });
      if (error) throw error;
    };

    const continueSignIn = async () => {
      if (signIn.status === "complete") return finishSignIn();
      if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust" || signIn.status === "needs_new_password") {
        router.replace(authFormUrl("sign-in", redirectUrl, true));
        return;
      }
      if (signIn.status === "needs_first_factor" || signIn.status === "needs_identifier") {
        router.replace(authFormUrl("sign-in", redirectUrl));
        return;
      }
      throw new Error("GitHub sign-in needs a step that this form does not support yet.");
    };

    const continueSignUp = async () => {
      if (signUp.status === "complete") return finishSignUp();
      if (signUp.status === "missing_requirements") {
        router.replace(authFormUrl("sign-up", redirectUrl, true));
        return;
      }
      throw new Error("GitHub sign-up is no longer active. Return to sign up and try again.");
    };

    void (async () => {
      try {
        if (signIn.status === "complete") return await finishSignIn();

        if (signUp.isTransferable) {
          const { error } = await signIn.create({ transfer: true });
          if (error) throw error;
          return await continueSignIn();
        }

        if (signIn.isTransferable) {
          const { error } = await signUp.create({ transfer: true });
          if (error) throw error;
          return await continueSignUp();
        }

        if (signUp.status === "complete") return await finishSignUp();

        if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust" || signIn.status === "needs_new_password") {
          return await continueSignIn();
        }

        const sessionId = signIn.existingSession?.sessionId ?? signUp.existingSession?.sessionId;
        if (sessionId) {
          await clerk.setActive({
            session: sessionId,
            navigate: async (params) => navigateToApp(params),
          });
          return;
        }

        if (signUp.status === "missing_requirements") return await continueSignUp();
        if (signIn.status === "needs_first_factor" || signIn.status === "needs_identifier") return await continueSignIn();

        throw new Error("We couldn't resume GitHub authentication. Return to the form and try again.");
      } catch (error) {
        setLocalError(clerkErrorMessage(error, "We couldn't finish GitHub authentication. Please try again."));
      }
    })();
  }, [clerk, origin, redirectUrl, router, signIn, signUp]);

  return (
    <div aria-busy={!localError}>
      <FormAlert>{localError}</FormAlert>
      {localError ? (
        <Link href={retryHref} className="button button-primary w-full !py-3">Return to {origin === "sign-in" ? "sign in" : "sign up"}</Link>
      ) : (
        <div role="status" className="flex items-center gap-3 rounded-xl border px-4 py-4 text-sm font-bold" style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}>
          <LoaderCircle aria-hidden="true" className="animate-spin" size={19} />
          Finishing GitHub authentication…
        </div>
      )}
      <div id="clerk-captcha" data-cl-theme="auto" data-cl-size="flexible" className="mt-4" />
    </div>
  );
}
