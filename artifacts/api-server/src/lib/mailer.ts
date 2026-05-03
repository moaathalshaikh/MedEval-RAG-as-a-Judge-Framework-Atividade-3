import nodemailer from "nodemailer";
import { logger } from "./logger";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables are required");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  resetUrl: string;
  appName?: string;
}): Promise<void> {
  const { to, resetUrl, appName = "MedEval Judge" } = opts;
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER;

  const transporter = getTransporter();

  await transporter.sendMail({
    from: `"${appName}" <${from}>`,
    to,
    subject: `Reset your password for ${appName}`,
    text: [
      `Hello,`,
      ``,
      `We received a request to reset your password for your ${appName} account.`,
      ``,
      `Click the link below to set a new password:`,
      `${resetUrl}`,
      ``,
      `This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.`,
      ``,
      `Thanks,`,
      `The ${appName} team`,
    ].join("\n"),
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td align="center" style="padding:32px 40px 24px;border-bottom:1px solid #e5e7eb;">
            <div style="width:48px;height:48px;background:#f0fdf4;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
              <span style="font-size:24px;">🩺</span>
            </div>
            <h1 style="margin:8px 0 0;font-size:20px;font-weight:700;color:#111827;">${appName}</h1>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111827;">Reset your password</h2>
            <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
              We received a request to reset the password for your account.
              Click the button below to choose a new password.
            </p>
            <a href="${resetUrl}"
               style="display:inline-block;padding:12px 28px;background:#16a34a;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:8px;">
              Reset password
            </a>
            <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
              This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
              © ${new Date().getFullYear()} ${appName}. AI evaluation system for medical language models.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
  });

  logger.info({ to }, "Password reset email sent");
}
