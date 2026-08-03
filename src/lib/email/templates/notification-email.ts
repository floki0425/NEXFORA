// Explicit .ts extension (unlike sibling templates) so this file resolves
// under Node's native TS loader without a bundler — required for
// tests/phase11/unit/notification-email-template.test.mjs to import it
// directly.
import { escapeHtml } from "../escape-html.ts";

export interface NotificationEmailContent {
  title: string;
  message: string | null;
  actionUrl: string | null;
  actionLabel: string | null;
}

export function renderNotificationEmailHtml({
  title,
  message,
  actionUrl,
  actionLabel,
}: NotificationEmailContent): string {
  const safeTitle = escapeHtml(title);
  const messageLine = message
    ? `<p style="margin:0 0 24px;color:#4B5563;font-size:14px;line-height:22px;">${escapeHtml(message)}</p>`
    : "";
  const actionBlock =
    actionUrl && actionLabel
      ? `<table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:#0B0D12;">
                      <a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 24px;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">${escapeHtml(actionLabel)}</a>
                    </td>
                  </tr>
                </table>`
      : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#F7F7F8;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F7F7F8;padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#0B0D12;padding:24px 32px;">
                <span style="color:#FFFFFF;font-size:16px;font-weight:600;letter-spacing:0.02em;">NEXFORA</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;color:#0B0D12;font-size:20px;line-height:28px;font-weight:600;">${safeTitle}</h1>
                ${messageLine}
                ${actionBlock}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #E5E7EB;">
                <p style="margin:0;color:#6B7280;font-size:12px;line-height:18px;">Nexfora Digital Innovation. You are receiving this because you have an active account at Nexfora.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
