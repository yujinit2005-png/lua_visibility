import React, { createContext, useContext, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AdminUser {
  username: string;
  name: string;
  role: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: AdminUser | null;
  login: (username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>;
}

const DEFAULT_ADMIN_ID = 'luaadmin';
const DEFAULT_ADMIN_PW = 'lua123!@#';
const STORAGE_KEY_AUTH = 'luvis_admin_auth';
const STORAGE_KEY_PW = 'luvis_admin_custom_pw';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem(STORAGE_KEY_AUTH) === 'true';
  });

  const [user, setUser] = useState<AdminUser | null>(() => {
    if (localStorage.getItem(STORAGE_KEY_AUTH) === 'true') {
      return { username: 'luaadmin', name: '루아 관리자', role: '시스템 최고관리자' };
    }
    return null;
  });

  // Supabase system_config에서 관리자 비밀번호 확인 또는 로컬 저장소 확인
  const getStoredPassword = async (): Promise<string> => {
    try {
      const { data, error } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'admin_credential')
        .maybeSingle();

      if (!error && data && data.value && data.value.password) {
        return data.value.password;
      }
    } catch (e) {
      console.warn('Supabase credential fetch fallback:', e);
    }

    const localPw = localStorage.getItem(STORAGE_KEY_PW);
    return localPw || DEFAULT_ADMIN_PW;
  };

  const login = async (username: string, password: string): Promise<{ success: boolean; message?: string }> => {
    const trimmedId = username.trim();
    const trimmedPw = password.trim();

    if (!trimmedId || !trimmedPw) {
      return { success: false, message: '아이디와 비밀번호를 모두 입력해 주세요.' };
    }

    if (trimmedId !== DEFAULT_ADMIN_ID) {
      return { success: false, message: '등록되지 않은 관리자 아이디입니다.' };
    }

    const currentPw = await getStoredPassword();

    if (trimmedPw !== currentPw) {
      return { success: false, message: '비밀번호가 일치하지 않습니다. 다시 확인해 주세요.' };
    }

    // 로그인 성공
    const adminUser: AdminUser = {
      username: DEFAULT_ADMIN_ID,
      name: '루아 관리자',
      role: '시스템 최고관리자'
    };

    localStorage.setItem(STORAGE_KEY_AUTH, 'true');
    setIsAuthenticated(true);
    setUser(adminUser);

    return { success: true };
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY_AUTH);
    setIsAuthenticated(false);
    setUser(null);
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> => {
    if (!currentPassword || !newPassword) {
      return { success: false, message: '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.' };
    }

    if (newPassword.length < 6) {
      return { success: false, message: '새 비밀번호는 최소 6자 이상이어야 합니다.' };
    }

    const currentStoredPw = await getStoredPassword();

    if (currentPassword.trim() !== currentStoredPw) {
      return { success: false, message: '현재 비밀번호가 일치하지 않습니다.' };
    }

    const trimmedNewPw = newPassword.trim();

    // 1. Supabase system_config에 저장 시도
    try {
      await supabase
        .from('system_config')
        .upsert({
          key: 'admin_credential',
          value: { username: DEFAULT_ADMIN_ID, password: trimmedNewPw, updated_at: new Date().toISOString() }
        }, { onConflict: 'key' });
    } catch (e) {
      console.warn('Failed to persist new password to Supabase:', e);
    }

    // 2. 로컬 스토리지 백업
    localStorage.setItem(STORAGE_KEY_PW, trimmedNewPw);

    return { success: true, message: '비밀번호가 성공적으로 변경되었습니다.' };
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
