import { config } from '../config.js';
import { logger } from './logger.js';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Sends through Resend when RESEND_API_KEY is set; otherwise writes the email to the log,
 * so every flow still works locally without an email account. Returns true if actually sent.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!config.RESEND_API_KEY) {
    logger.info({ to: email.to, subject: email.subject, text: email.text }, 'email (not sent: RESEND_API_KEY not set)');
    return false;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, body: await res.text() }, 'email send failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, 'email send failed');
    return false;
  }
}

export function inviteEmail(v: { to: string; inviter: string; workspace: string; role: string; url: string }): Email {
  const text = `${v.inviter} invited you to join ${v.workspace} on TaskNest as ${v.role === 'admin' ? 'an admin' : `a ${v.role}`}.\n\nAccept the invite: ${v.url}\n\nThe link expires in 7 days.`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:480px">
<p><strong>${escapeHtml(v.inviter)}</strong> invited you to join <strong>${escapeHtml(v.workspace)}</strong> on TaskNest as ${v.role === 'admin' ? 'an admin' : `a ${escapeHtml(v.role)}`}.</p>
<p><a href="${escapeHtml(v.url)}" style="display:inline-block;background:#2f5db3;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Accept invite</a></p>
<p style="color:#5b6475;font-size:12px">The link expires in 7 days. If you did not expect this, you can ignore this email.</p></div>`;
  return { to: v.to, subject: `${v.inviter} invited you to ${v.workspace} on TaskNest`, text, html };
}
