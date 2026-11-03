export interface AuthFormState {
  error?: string;
  sent?: boolean;
}

export const MESSAGES = {
  invalidCredentials: 'The username or password is incorrect. After several failed attempts your account may be locked; your administrator can unlock it.',
  unavailable: 'Sign-in is temporarily unavailable. Please try again in a moment.',
  tooMany: 'Too many attempts. Please wait a few minutes and try again.',
  missingCredentials: 'Enter your username and password.',
  passwordsDiffer: 'The two passwords do not match.',
  invalidResetLink: 'This reset link is invalid or has expired. Request a new one.',
  invalidInviteLink: 'This invitation link is invalid, has expired or was already used. Ask your administrator to send a new one.',
} as const;

export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}
