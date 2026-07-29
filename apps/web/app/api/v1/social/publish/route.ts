// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { NextRequest } from 'next/server';
import { proxy } from '../_proxy';
export async function POST(req: NextRequest) { return proxy('POST', '/v1/social/publish', await req.text()); }
