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
    supportedSecondFactors: [] as Array<{ strategy: string }>,
    password: succeeds(),
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
    requiredFields: [] as string[],
    optionalFields: [] as string[],
    unverifiedFields: ["email_address"] as string[],
    password: succeeds(),
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
