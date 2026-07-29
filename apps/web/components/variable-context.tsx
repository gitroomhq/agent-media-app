'use client';

// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Runtime configuration for the web app.
 *
 * Next.js inlines `process.env.NEXT_PUBLIC_*` at BUILD time, which would bake
 * one deployment's config into the Docker image — a self-hoster could not
 * change it without rebuilding. Instead, the root layout is a server component
 * (`export const dynamic = 'force-dynamic'`) that reads env at REQUEST time and
 * passes the values in here as props.
 *
 * This mirrors the pattern used by our sibling project Postiz
 * (gitroomhq/postiz-app, `libraries/react-shared-libraries/src/helpers/variable.context.tsx`),
 * so one image runs in any environment.
 *
 * Values are exposed to React via `useVariables()` and mirrored onto
 * `window.vars` for the rare non-React reader (`loadVars()`).
 *
 * Only NON-SECRET, browser-safe values belong here. Never pass a service-role
 * key, a provider API key, or any server-only secret into this component.
 */

import { createContext, useContext, useEffect, type FC, type ReactNode } from 'react';

export interface VariableContextInterface {
  /** Public API origin the browser talks to (api-v2). */
  backendUrl: string;
  /** Supabase project URL (browser-safe). */
  supabaseUrl: string;
  /** Supabase anon key — browser-safe by design, protected by RLS. */
  supabaseAnonKey: string;
  /** True when Stripe is configured server-side; hides billing UI when false. */
  billingEnabled: boolean;
  /** Hosted MCP connector URL, shown on the integrations page. */
  mcpUrl: string;
  /** 'development' | 'production' */
  environment: string;
  /** Optional analytics/monitoring DSNs — empty string disables them. */
  sentryDsn: string;
  posthogKey: string;
}

const EMPTY: VariableContextInterface = {
  backendUrl: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  billingEnabled: false,
  mcpUrl: '',
  environment: 'production',
  sentryDsn: '',
  posthogKey: '',
};

const VariableContext = createContext<VariableContextInterface>(EMPTY);

export const VariableContextComponent: FC<
  VariableContextInterface & { children: ReactNode }
> = (props) => {
  const { children, ...vars } = props;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { vars: VariableContextInterface }).vars = vars;
    }
  }, [vars]);

  return <VariableContext.Provider value={vars}>{children}</VariableContext.Provider>;
};

/** Read runtime config inside a React component. */
export const useVariables = () => useContext(VariableContext);

/** Read runtime config outside React (after first client render). */
export const loadVars = (): VariableContextInterface =>
  (typeof window !== 'undefined'
    ? (window as unknown as { vars?: VariableContextInterface }).vars
    : undefined) ?? EMPTY;
