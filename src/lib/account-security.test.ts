import { beforeEach, describe, expect, it, vi } from 'vitest';
import { changePasswordWithReauthentication, enrollTotp, isValidAvatarBytes, removeTotp, requiresMfaChallenge, validateAvatarFile, verifyTotp } from './account-security';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  enroll: vi.fn(),
  challengeAndVerify: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  unenroll: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: { auth: {
    signInWithPassword: mocks.signInWithPassword,
    updateUser: mocks.updateUser,
    mfa: {
      enroll: mocks.enroll,
      challengeAndVerify: mocks.challengeAndVerify,
      getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
      unenroll: mocks.unenroll,
    },
  } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signInWithPassword.mockResolvedValue({ error: null });
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.enroll.mockResolvedValue({ data: { id: 'factor-1', totp: { qr_code: 'qr', secret: 'secret' } }, error: null });
  mocks.challengeAndVerify.mockResolvedValue({ error: null });
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal2' }, error: null });
  mocks.unenroll.mockResolvedValue({ error: null });
});

describe('account security helpers', () => {
  it('verifies the current password before changing it', async () => {
    await changePasswordWithReauthentication('owner@example.test', 'CurrentPassword1', 'NewPassword123');
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'owner@example.test', password: 'CurrentPassword1' });
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'NewPassword123' });
    expect(mocks.signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateUser.mock.invocationCallOrder[0]);
  });

  it('rejects a wrong current password without calling updateUser', async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error('auth detail') });
    await expect(changePasswordWithReauthentication('owner@example.test', 'wrong', 'NewPassword123')).rejects.toThrow('Password could not be updated. Check your current password and try again.');
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it('uses Supabase enrollment, challenge verification, and AAL2 before removal', async () => {
    await expect(enrollTotp()).resolves.toEqual({ factorId: 'factor-1', qrCode: 'qr', secret: 'secret' });
    await verifyTotp('factor-1', '123456');
    await removeTotp('factor-1', '123456');
    expect(mocks.enroll).toHaveBeenCalledWith({ factorType: 'totp', friendlyName: 'Authenticator app' });
    expect(mocks.challengeAndVerify).toHaveBeenCalledTimes(2);
    expect(mocks.unenroll).toHaveBeenCalledWith({ factorId: 'factor-1' });
  });

  it('refuses factor removal unless the current assurance level is aal2', async () => {
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: 'aal1' }, error: null });
    await expect(removeTotp('factor-1', '123456')).rejects.toThrow('Two-factor verification is required before removing this factor.');
    expect(mocks.unenroll).not.toHaveBeenCalled();
  });

  it('requires a verified challenge before dashboard access when an enrolled factor is present', () => {
    expect(requiresMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal2', hasVerifiedFactor: true, assuranceVerified: true })).toBe(true);
    expect(requiresMfaChallenge({ currentLevel: 'aal2', nextLevel: 'aal2', hasVerifiedFactor: true, assuranceVerified: true })).toBe(false);
    expect(requiresMfaChallenge({ currentLevel: 'aal1', nextLevel: 'aal1', hasVerifiedFactor: false, assuranceVerified: true })).toBe(false);
    expect(requiresMfaChallenge({ currentLevel: null, nextLevel: null, hasVerifiedFactor: false, assuranceVerified: false })).toBe(true);
  });

  it('validates avatar magic bytes and the 2 MB limit', async () => {
    expect(isValidAvatarBytes('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(isValidAvatarBytes('image/png', new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toBe(false);
    await expect(validateAvatarFile(new File([new Uint8Array([0xff, 0xd8, 0xff])], 'avatar.jpg', { type: 'image/jpeg' }))).resolves.toBeUndefined();
    await expect(validateAvatarFile(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).rejects.toThrow('Choose an image no larger than 2 MB.');
  });
});
