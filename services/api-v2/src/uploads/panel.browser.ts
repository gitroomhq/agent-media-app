// Copyright 2026 agent-media contributors. Apache-2.0 license.
import { App } from '@modelcontextprotocol/ext-apps';
import type { UploadView } from './types.js';

declare global {
  interface Window {
    __UPLOAD_CONFIG__: { apiBase: string };
  }
}
const apiBase = window.__UPLOAD_CONFIG__.apiBase;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const drop = element<HTMLButtonElement>('drop');
const files = element<HTMLInputElement>('files');
const use = element<HTMLButtonElement>('use');
const copy = element<HTMLButtonElement>('copy');
const list = element<HTMLUListElement>('list');
const notice = element<HTMLDivElement>('notice');
let sessionId = '';
let uploadToken = '';
let view: UploadView | null = null;
let app: App | null = null;
let busy = false;
const failed = new Map<string, File>();
function say(text: string, error = false) {
  notice.textContent = text;
  notice.classList.toggle('error', error);
}
function active() {
  return !!view && Date.parse(view.expires_at) > Date.now();
}
function controls() {
  drop.disabled = busy || !active() || (view?.images.length ?? 0) >= 10;
  use.disabled = copy.disabled = busy || !active() || !view?.images.length;
  element('use-label').textContent = app ? 'Use images in chat' : 'Done uploading';
  drop.setAttribute('aria-busy', String(busy));
  const count = view?.images.length ?? 0;
  element('count').textContent = `${count} / 10`;
  element('count').setAttribute('aria-label', `${count} of 10 images uploaded`);
}
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(
    `${apiBase}/v1/upload-panels/${encodeURIComponent(sessionId)}${path}`,
    {
      ...init,
      headers: { Authorization: `Upload ${uploadToken}`, ...init.headers },
      credentials: 'omit',
      signal: AbortSignal.timeout(90_000),
    },
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Upload interrupted. Please retry.');
  return body;
}
function render() {
  list.replaceChildren();
  for (const image of view?.images ?? []) {
    const row = document.createElement('li');
    row.className = 'item';
    const preview = document.createElement('img');
    preview.src = image.image_url;
    preview.alt = image.filename;
    preview.referrerPolicy = 'no-referrer';
    const details = document.createElement('div');
    details.className = 'details';
    const title = document.createElement('strong');
    title.textContent = image.filename;
    const meta = document.createElement('small');
    meta.textContent = `${image.width} × ${image.height} · Ready`;
    details.append(title, meta);
    const ready = document.createElement('span');
    ready.className = 'ready-mark';
    ready.textContent = '✓';
    ready.setAttribute('aria-hidden', 'true');
    row.append(preview, details, ready);
    list.append(row);
  }
  for (const [id, file] of failed) {
    const row = document.createElement('li');
    row.className = 'item failed';
    const details = document.createElement('div');
    details.className = 'details';
    const title = document.createElement('strong');
    title.textContent = file.name;
    const meta = document.createElement('small');
    meta.textContent = 'Not uploaded';
    details.append(title, meta);
    const retry = document.createElement('button');
    retry.textContent = 'Retry';
    retry.disabled = busy || !active();
    retry.onclick = () => void uploadBatch([{ id, file }]);
    const remove = document.createElement('button');
    remove.textContent = 'Dismiss';
    remove.disabled = busy;
    remove.onclick = () => {
      failed.delete(id);
      render();
    };
    row.append(details, retry, remove);
    list.append(row);
  }
  if (view)
    element('expiry').textContent = `Links expire ${new Date(view.expires_at).toLocaleString()}.`;
  controls();
}
async function refresh() {
  view = (await request('')) as UploadView;
  render();
}
function imageText() {
  return (view?.images ?? [])
    .map((image) => `${image.filename}: ${image.image_url}\nExpires: ${image.expires_at}`)
    .join('\n\n');
}
async function copyLinks() {
  const text = imageText();
  try {
    await navigator.clipboard.writeText(text);
    say('Copied. Paste these links into your conversation.');
  } catch {
    const manual = element<HTMLTextAreaElement>('manual');
    manual.hidden = false;
    manual.value = text;
    manual.select();
    say('Select and copy the links below, then paste them into your conversation.');
  }
}
async function uploadBatch(items: { id: string; file: File }[]) {
  if (busy || !active()) return;
  if (items.length + (view?.images.length ?? 0) > 10) {
    say('Choose up to 10 images per panel.', true);
    return;
  }
  busy = true;
  controls();
  for (const { id, file } of items) {
    failed.delete(id);
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      !file.size ||
      file.size > 25 * 1024 * 1024
    ) {
      say(`${file.name}: choose a PNG, JPEG, or WebP image up to 25 MB.`, true);
      continue;
    }
    say(`Uploading ${file.name}…`);
    const progress = document.createElement('progress');
    progress.removeAttribute('value');
    progress.setAttribute('aria-label', `Uploading ${file.name}`);
    element('drop').after(progress);
    try {
      await request(`/files/${id}?filename=${encodeURIComponent(file.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      await refresh();
      say(`${view!.images.length} image${view!.images.length === 1 ? '' : 's'} ready.`);
    } catch (error) {
      failed.set(id, file);
      say((error as Error).message, true);
    } finally {
      progress.remove();
    }
  }
  busy = false;
  render();
}
function pick(chosen: FileList | File[]) {
  void uploadBatch(Array.from(chosen).map((file) => ({ id: crypto.randomUUID(), file })));
}
drop.onclick = () => files.click();
files.onchange = () => {
  if (files.files) pick(files.files);
  files.value = '';
};
drop.ondragover = (event) => {
  event.preventDefault();
  if (!drop.disabled) drop.classList.add('drag');
};
drop.ondragleave = () => drop.classList.remove('drag');
drop.ondrop = (event) => {
  event.preventDefault();
  drop.classList.remove('drag');
  if (!drop.disabled && event.dataTransfer) pick(event.dataTransfer.files);
};
window.addEventListener('dragover', (event) => event.preventDefault());
window.addEventListener('drop', (event) => event.preventDefault());
copy.onclick = () => void copyLinks();
use.onclick = async () => {
  if (!app) {
    say(
      'Your images are ready. Return to your conversation and tell your agent you have finished uploading.',
    );
    return;
  }
  try {
    await refresh();
    if (app.getHostCapabilities()?.updateModelContext) {
      await app
        .updateModelContext({
          structuredContent: { session_id: sessionId, images: view!.images },
          content: [{ type: 'text', text: imageText() }],
        })
        .catch(() => {});
    }
    const sent = await app.sendMessage({
      role: 'user',
      content: [
        { type: 'text', text: `Use these uploaded images for my generation.\n\n${imageText()}` },
      ],
    });
    if (sent.isError) throw new Error('The host could not send this message.');
    say('Images shared with your agent. Continue in the conversation.');
  } catch {
    say('Your images are ready. Copy the links to continue in your conversation.', true);
    await copyLinks();
  }
};
async function initialize(id: string, token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[a-f0-9]{64}$/.test(token)) {
    say('Ask your agent to open a new upload panel.', true);
    return;
  }
  sessionId = id;
  uploadToken = token;
  try {
    await refresh();
    say(
      view!.images.length
        ? 'Your uploaded images are ready.'
        : 'Choose your images to get started.',
    );
  } catch (error) {
    say((error as Error).message, true);
  }
}
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.has('session')) {
  // Fragment capabilities are never sent in the URL request or Referer header.
  void initialize(fragment.get('session')!, fragment.get('token') || '');
} else if (window.parent !== window) {
  app = new App({ name: 'Agent Media image upload', version: '1.0.0' }, {});
  app.ontoolresult = (result) => {
    const data = result.structuredContent as { session_id?: string } | undefined;
    const meta = result._meta as { upload_token?: string } | undefined;
    if (data?.session_id && meta?.upload_token) void initialize(data.session_id, meta.upload_token);
  };
  void app.connect().catch(() => {
    app = null;
    controls();
    say('Open the upload link in your conversation to continue in your browser.', true);
  });
} else {
  say('Ask your agent to open an Agent Media upload panel, then follow its link.', true);
}
setInterval(() => {
  if (view && !active()) {
    controls();
    say('These images have expired. Ask your agent for a new panel.', true);
  }
}, 15_000);
