import { authApi } from './api';

export interface User {
  parentId: string;
  email: string;
  expiresAt?: string;
}

export const authService = {
  async login(email: string, password: string): Promise<User> {
    const res = await authApi.login({ email, password });
    return res.user;
  },

  async checkAuth(): Promise<User | null> {
    try {
      const res = await authApi.getMe();
      if (res.authenticated && res.user) {
        return res.user;
      }
      return null;
    } catch {
      return null;
    }
  },

  async logout(): Promise<void> {
    await authApi.logout();
  }
};
