import { escapeHtml } from "../escape-html";

export interface ProposalEmailContent {
  recipientName: string;
  proposalTitle: string;
  proposalNumber: string;
  proposalUrl: string;
  validUntil: string | null;
}

export function renderProposalEmailHtml({
  recipientName,
  proposalTitle,
  proposalNumber,
  proposalUrl,
  validUntil,
}: ProposalEmailContent): string {
  const safeName = escapeHtml(recipientName);
  const safeTitle = escapeHtml(proposalTitle);
  const safeNumber = escapeHtml(proposalNumber);
  const safeUrl = escapeHtml(proposalUrl);
  const validityLine = validUntil
    ? `<p style="margin:0 0 24px;color:#4B5563;font-size:14px;line-height:22px;">This proposal is valid until ${escapeHtml(validUntil)}.</p>`
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
                <p style="margin:0 0 8px;color:#6366F1;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;">Proposal ${safeNumber}</p>
                <h1 style="margin:0 0 16px;color:#0B0D12;font-size:22px;line-height:30px;font-weight:600;">${safeTitle}</h1>
                <p style="margin:0 0 24px;color:#4B5563;font-size:14px;line-height:22px;">Hi ${safeName}, Nexfora has prepared a proposal for your project. Please review the details and let us know how you would like to proceed.</p>
                ${validityLine}
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:8px;background-color:#0B0D12;">
                      <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none;">View proposal</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #E5E7EB;">
                <p style="margin:0;color:#6B7280;font-size:12px;line-height:18px;">Nexfora Digital Innovation. This link is unique to you — please do not forward it.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
