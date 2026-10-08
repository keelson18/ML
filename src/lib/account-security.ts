import { supabase } from './supabase';

export interface TotpFactor {
  id: string;
  friendly_name?: string;
  status: string;
}

export function requiresMfaChallenge(input: { currentLevel: string | null | undefined; nextLevel: string | null | undefined; hasVerifiedFactor: boolean; assuranceVerified: boolean }): boolean {
  if (!input.assuranceVerified) return true;
  return input.hasVerifiedFactor && input.nextLevel === 'aal2' && input.currentLevel !== 'aal2';
}

export async function changePasswordWithReauthentication(email: string, currentPassword: string, newPassword: string): Promise<void> {
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError) throw new Error('Password could not be updated. Check your current password and try again.');
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) throw new Error('Password could not be updated. Check the password requirements and try again.');
}

export async function listTotpFactors(): Promise<TotpFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw new Error('Two-factor settings are unavailable.');
  return data.totp;
}

export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
  if (error) throw new Error('Could not start two-factor enrollment.');
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(factorId: string, code: string): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) throw new Error('The authenticator code was not accepted.');
}

export async function removeTotp(factorId: string, code: string): Promise<void> {
  await verifyTotp(factorId, code);
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== 'aal2') throw new Error('Two-factor verification is required before removing this factor.');
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw new Error('Could not remove the two-factor method.');
}

export function isValidAvatarBytes(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (contentType === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

export async function validateAvatarFile(file: File): Promise<void> {
  if (file.size > 2 * 1024 * 1024) throw new Error('Choose an image no larger than 2 MB.');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!isValidAvatarBytes(file.type, bytes)) throw new Error('The selected file does not match its image type.');
}

export async function signOutOtherSessions(): Promise<void> {
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) throw new Error('Could not sign out other devices.');
}
