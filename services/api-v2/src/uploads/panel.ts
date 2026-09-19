// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { readFileSync } from 'node:fs';
import { UPLOAD_RESOURCE_URI, UPLOAD_RESOURCE_MIME } from './types.js';

export function uploadPanelHtml(apiBase: string): string {
  const template = readFileSync(new URL('../../dist/upload-panel.html', import.meta.url), 'utf8');
  const config = JSON.stringify({ apiBase }).replace(/</g, '\\u003c');
  return template.replace('__UPLOAD_BOOTSTRAP_JSON__', () => config);
}

export function uploadPanelResource(apiBase: string) {
  return {
    uri: UPLOAD_RESOURCE_URI,
    mimeType: UPLOAD_RESOURCE_MIME,
    text: uploadPanelHtml(apiBase),
    _meta: {
      ui: {
        csp: {
          connectDomains: [new URL(apiBase).origin],
          resourceDomains: [new URL(apiBase).origin],
        },
        prefersBorder: true,
      },
    },
  };
}
