/**
 * Brevo transactional email delivery for PMC Leela account verification.
 */

const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

function buildOtpEmailHtml({ purpose, intro, otp, safetyNote }) {
  const safeOtp = String(otp).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title>PMC Leela ${purpose}</title>
  </head>
  <body style="margin:0;padding:24px 12px;background:#f7f7fa;color:#172033;font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e6e7ed;border-radius:12px">
      <tr>
        <td style="padding:32px 30px 28px">
          <h1 style="margin:0 0 26px;text-align:center;color:#111827;font-size:23px;line-height:1.3;font-weight:700">PMC Leela</h1>
          <p style="margin:0 0 14px;color:#344054;font-size:15px;line-height:1.65">Hey there,</p>
          <p style="margin:0 0 22px;color:#344054;font-size:15px;line-height:1.7">${intro}</p>
          <div style="margin:0 0 22px;padding:17px 12px;background:#f2f3f6;border-left:3px solid #d9468f;border-radius:7px;text-align:center">
            <span style="color:#182033;font-family:Arial,Helvetica,sans-serif;font-size:29px;line-height:1.35;font-weight:700;letter-spacing:7px">${safeOtp}</span>
          </div>
          <p style="margin:0;color:#596579;font-size:14px;line-height:1.7">${safetyNote}</p>
          <p style="margin:28px 0 0;text-align:center;color:#778196;font-size:12px;line-height:1.8">
            Built for MANITians by <span style="font-style:italic;color:#596579">_alkaar_</span><br>
            &copy; 2026 PMC Leela
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendTransactionalEmail({ toEmail, subject, htmlContent, label }) {
  const brevoApiKey = process.env.BREVO_API_KEY || '';
  const fromEmail = process.env.FROM_EMAIL || (
    process.env.NODE_ENV === 'production' ? '' : 'pmcleelaofficial@gmail.com'
  );
  const fromName = process.env.FROM_NAME || 'PMC Leela';
  if (!brevoApiKey || !fromEmail) {
    if (process.env.NODE_ENV === 'production') {
      const missing = [
        !brevoApiKey && 'BREVO_API_KEY',
        !fromEmail && 'FROM_EMAIL'
      ].filter(Boolean);
      console.error(`[BREVO] ${label} email configuration is missing: ${missing.join(', ')}.`);
      return {
        success: false,
        error: `Email delivery is not configured. Check ${missing.join(' and ')} in the backend environment.`
      };
    }
    return { success: true, simulated: true };
  }

  try {
    const response = await fetch(BREVO_EMAIL_URL, {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: toEmail }],
        subject,
        htmlContent
      })
    });
    const responseBody = await response.text();
    let data = {};
    if (responseBody) {
      try {
        data = JSON.parse(responseBody);
      } catch {
        data = { message: responseBody.slice(0, 500) };
      }
    }
    if (!response.ok) {
      const error = typeof data.message === 'string' ? data.message : 'Brevo email delivery failed.';
      console.error(`[BREVO] ${label} email failed (${response.status}): ${error}`);
      return { success: false, error };
    }

    console.info(`[BREVO] ${label} email accepted by Brevo${data.messageId ? ` (message ID: ${data.messageId})` : ''}.`);
    return { success: true, messageId: data.messageId };
  } catch (error) {
    console.error(`[BREVO] ${label} email network exception:`, error.message);
    return { success: false, error: error.message };
  }
}

async function sendOtpEmail(toEmail, otp) {
  const result = await sendTransactionalEmail({
    toEmail,
    subject: `[${otp}] PMC Leela - Verification code`,
    htmlContent: buildOtpEmailHtml({
      purpose: 'verification code',
      intro: 'Welcome to PMC Leela! To complete your sign-up and join the MANIT Bhopal community, enter this verification code in the app:',
      otp,
      safetyNote: 'This code expires in 10 minutes. Never share it with anyone. If you did not request it, you can safely ignore this email.'
    }),
    label: 'Verification'
  });
  return result.simulated
    ? { ...result, message: 'OTP generated (Brevo API key missing)', devOtp: otp }
    : result;
}

async function sendPasswordResetEmail(toEmail, otp) {
  return sendTransactionalEmail({
    toEmail,
    subject: `[${otp}] PMC Leela - Password reset code`,
    htmlContent: buildOtpEmailHtml({
      purpose: 'password reset code',
      intro: 'Use this one-time code in PMC Leela to reset your account password:',
      otp,
      safetyNote: 'This code expires in 10 minutes and can only be used once. Your existing password has not been sent or changed. If you did not request a reset, you can safely ignore this email.'
    }),
    label: 'Password reset'
  });
}

module.exports = {
  sendOtpEmail,
  sendPasswordResetEmail
};
