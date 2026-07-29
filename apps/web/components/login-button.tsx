// Copyright 2026 agent-media contributors. Apache-2.0 license.

'use client';

import { useLogin } from '@/components/login-context';

export function LoginButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { openLogin } = useLogin();

  return (
    <button onClick={openLogin} className={`cursor-pointer ${className ?? ''}`.trim()}>
      {children}
    </button>
  );
}
