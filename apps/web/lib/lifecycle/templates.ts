// Copyright 2026 agent-media contributors. Apache-2.0 license.
// Lifecycle email copy. Plain, short, from the team (info@), one CTA each.
import type { EmailKind } from './rules';

const APP = 'https://app.agent-media.ai';
const link = (path: string, kind: EmailKind) =>
  `${APP}${path}${path.includes('?') ? '&' : '?'}utm_source=email&utm_medium=lifecycle&utm_campaign=lifecycle_${kind}`;

interface Copy {
  subject: string;
  preview: string;
  body: string[]; // paragraphs
  cta: { label: string; path: string };
}

const COPY: Record<EmailKind, Copy> = {
  welcome: {
    subject: 'your first video is free',
    preview: 'Add a card, $0 today, and make a 5-second UGC video.',
    body: [
      'Welcome to agent-media.',
      'Your first 5-second video is on us. Add a card ($0 today), pick an AI actor, paste a script or let it write one, and you get a talking-head ad back in minutes.',
      'If you like it, you move to Creator ($39/mo) after 3 days. If not, cancel before then in one click.',
      'Works from the web, Claude Code, Cursor, MCP or the API.',
    ],
    cta: { label: 'Make my free video', path: '/subscribe' },
  },
  nudge_d2: {
    subject: 'your free video is still waiting',
    preview: 'Five seconds, one actor, your script.',
    body: [
      'You signed up two days ago but haven\'t made your free video yet.',
      'It takes about two minutes: pick an actor, write one line about your product, hit generate. $0 today.',
      'Stuck on something? Reply to this email and we\'ll help.',
    ],
    cta: { label: 'Make my free video', path: '/subscribe' },
  },
  nudge_d5: {
    subject: 'one ad, no creators, no filming',
    preview: 'What teams use agent-media for.',
    body: [
      'Most teams use agent-media to test many ad angles fast: one script, several AI actors, a batch of 9:16 videos ready for TikTok, Reels and Shorts.',
      'Developers run the same thing from Claude Code or the API, so new product pages get a video automatically.',
      'Your free 5-second video is still there when you want it.',
    ],
    cta: { label: 'Try it free', path: '/subscribe' },
  },
  trial_ending: {
    subject: 'your trial ends tomorrow',
    preview: 'Creator starts at $39/mo unless you cancel.',
    body: [
      'Heads up: your agent-media trial ends in less than 24 hours.',
      'After that you\'re on Creator: $39/mo with 3,900 credits every month. Nothing to do if you want to keep going.',
      'If you don\'t, cancel from Billing before the trial ends and you won\'t be charged.',
    ],
    cta: { label: 'Open billing', path: '/billing' },
  },
  payment_failed: {
    subject: 'your payment didn\'t go through',
    preview: 'Update your card to keep your plan.',
    body: [
      'We couldn\'t charge your card for your agent-media plan.',
      'Update your payment method in Billing to keep your credits and your videos running.',
    ],
    cta: { label: 'Update my card', path: '/billing' },
  },
  winback_d3: {
    subject: 'what didn\'t work?',
    preview: 'One question, one line is enough.',
    body: [
      'You cancelled agent-media a few days ago. We\'d really like to know why: just hit reply, one line is enough.',
      'Your account and videos are still here if you come back.',
    ],
    cta: { label: 'See plans', path: '/subscribe' },
  },
};

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function renderEmail(kind: EmailKind, opts: { unsubscribeUrl: string }): RenderedEmail {
  const c = COPY[kind];
  const url = link(c.cta.path, kind);
  const text = [...c.body, `${c.cta.label}: ${url}`, 'The agent-media team', `Unsubscribe: ${opts.unsubscribeUrl}`].join('\n\n');
  const p = (s: string) =>
    `<p style="margin-top:0;margin-bottom:14px;font-family:Arial, Helvetica, sans-serif;font-size:15px;line-height:23px;color:#111111;">${s}</p>`;
  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>' +
    `<body style="margin:0;padding:0;background-color:#ffffff;"><div style="display:none;max-height:0;overflow:hidden;">${esc(c.preview)}</div>` +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding-top:24px;padding-bottom:24px;padding-left:20px;padding-right:20px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;"><tr><td>' +
    c.body.map((b) => p(esc(b))).join('') +
    p(`<a href="${url}" style="color:#6d28d9;font-weight:bold;text-decoration:underline;">${esc(c.cta.label)} &rarr;</a>`) +
    p('The agent-media team') +
    `<p style="margin-top:16px;margin-bottom:0;font-family:Arial, Helvetica, sans-serif;font-size:12px;line-height:18px;color:#888888;"><a href="${opts.unsubscribeUrl}" style="color:#888888;">Unsubscribe</a></p>` +
    '</td></tr></table></td></tr></table></body></html>';
  return { subject: c.subject, text, html };
}
