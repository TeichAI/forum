import { vi } from "vitest";

export type ClerkFieldError = { message?: string; longMessage?: string };

export function createClerkErrors(fields: Record<string, ClerkFieldError> = {}, global: ClerkFieldError[] = []) {
  return { fields, global };
}

const succeeds = () => vi.fn(async (...args: unknown[]): Promise<{ error: unknown }> => {
  void args;
  return { error: null };
});

export function createSignInHook(overrides: Record<string, unknown> = {}) {
  const { signIn: signInOverrides, ...hookOverrides } = overrides;
  const signIn = {
    status: "needs_first_factor",
    isTransferable: false,
    existingSession: undefined as { sessionId: string } | undefined,
    supportedFirstFactors: [] as Array<{ strategy: string }>,
    supportedSecondFactors: [] as Array<{ strategy: string }>,
    password: succeeds(),
    ticket: succeeds(),
    sso: succeeds(),
    create: succeeds(),
    finalize: succeeds(),
    reset: succeeds(),
    resetPasswordEmailCode: {
      sendCode: succeeds(),
      verifyCode: succeeds(),
      submitPassword: succeeds(),
    },
    mfa: {
      sendEmailCode: succeeds(),
      sendPhoneCode: succeeds(),
      verifyEmailCode: succeeds(),
      verifyPhoneCode: succeeds(),
      verifyTOTP: succeeds(),
      verifyBackupCode: succeeds(),
    },
    ...(signInOverrides as object | undefined),
  };

  return {
    signIn,
    errors: createClerkErrors(),
    fetchStatus: "idle",
    ...hookOverrides,
  };
}

export function createSignUpHook(overrides: Record<string, unknown> = {}) {
  const { signUp: signUpOverrides, ...hookOverrides } = overrides;
  const signUp = {
    status: "missing_requirements",
    isTransferable: false,
    existingSession: undefined as { sessionId: string } | undefined,
    requiredFields: [] as string[],
    optionalFields: [] as string[],
    missingFields: [] as string[],
    unverifiedFields: ["email_address"] as string[],
    emailAddress: null as string | null,
    firstName: null as string | null,
    lastName: null as string | null,
    password: succeeds(),
    ticket: succeeds(),
    sso: succeeds(),
    create: succeeds(),
    update: succeeds(),
    finalize: succeeds(),
    reset: succeeds(),
    verifications: {
      sendEmailCode: succeeds(),
      verifyEmailCode: succeeds(),
    },
    ...(signUpOverrides as object | undefined),
  };

  return {
    signUp,
    errors: createClerkErrors(),
    fetchStatus: "idle",
    ...hookOverrides,
  };
}

export function createWaitlistHook(overrides: Record<string, unknown> = {}) {
  const { waitlist: waitlistOverrides, ...hookOverrides } = overrides;
  const waitlist = {
    id: "",
    createdAt: null,
    updatedAt: null,
    join: succeeds(),
    ...(waitlistOverrides as object | undefined),
  };

  return {
    waitlist,
    errors: createClerkErrors(),
    fetchStatus: "idle",
    ...hookOverrides,
  };
}
