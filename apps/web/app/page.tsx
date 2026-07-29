// Copyright 2026 agent-media contributors. Apache-2.0 license.

/**
 * Root route for the self-hosted app.
 *
 * The hosted marketing site is not part of this open-source distribution —
 * self-hosters land straight in the product. Signed-out visitors are sent to
 * login by the dashboard's own auth guard.
 */

import { redirect } from 'next/navigation';

export default function RootPage() {
  redirect('/dashboard');
}
