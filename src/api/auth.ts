import { api } from './client';
import type { UserProfile, UserRole } from '../lib/types';

export interface AuthSession {
  session: { access_token: string; refresh_token: string; expires_at: number };
  user: { id: string; email: string };
  profile: UserProfile | null;
}

export const authApi = {
  signIn: (email: string, password: string) =>
    api.post<AuthSession>('/auth/sign-in', { email, password }),

  signUp: (email: string, password: string, role: UserRole = 'user', metadata?: Record<string, unknown>) =>
    api.post('/auth/sign-up', { email, password, metadata: { role, ...metadata } }),

  getProfile: () =>
    api.get<{ profile: UserProfile | null }>('/auth/profile'),

  getAllProfiles: () =>
    api.get<{ profiles: UserProfile[] }>('/auth/profiles'),

  updateProfileRole: (userId: string, role: string) =>
    api.put('/auth/profiles/role', { userId, role }),
};
