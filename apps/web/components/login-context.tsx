// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { LoginModal } from '@/components/login-modal';

const LoginContext = createContext<{ openLogin: () => void }>({
  openLogin: () => {},
});

export function useLogin() {
  return useContext(LoginContext);
}

export function LoginProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const openLogin = useCallback(() => setOpen(true), []);

  return (
    <LoginContext.Provider value={{ openLogin }}>
      {children}
      <LoginModal open={open} onClose={() => setOpen(false)} />
    </LoginContext.Provider>
  );
}
