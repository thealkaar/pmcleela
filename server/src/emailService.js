/**
 * Brevo (formerly Sendinblue) Transactional Email Service for MANIT Student OTP Verification
 */

/**
 * Send 6-Digit OTP Email to MANIT student email via Brevo
 * @param {string} toEmail - Student college email (scholarNO@stu.manit.ac.in)
 * @param {string} otp - 6-digit numeric OTP code
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendOtpEmail(toEmail, otp) {
  const brevoApiKey = process.env.BREVO_API_KEY || '';
  const fromEmail = process.env.FROM_EMAIL || 'pmcleelaofficial@gmail.com';
  const fromName = process.env.FROM_NAME || 'PMC Leela';

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #07080c; margin: 0; padding: 20px; color: #f8fafc; }
        .container { max-width: 520px; margin: 0 auto; background: #111422; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 12px 30px rgba(0,0,0,0.6); }
        .header { background: linear-gradient(135deg, #ec4899 0%, #a855f7 100%); padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: 0.5px; }
        .header p { margin: 6px 0 0 0; color: #fce7f3; font-size: 13px; font-weight: 500; }
        .content { padding: 28px 24px; }
        .greeting { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
        .text { color: #94a3b8; font-size: 13.5px; line-height: 1.6; margin-bottom: 20px; }
        .otp-box { background: #0c0e17; border: 2px dashed #ec4899; border-radius: 14px; padding: 20px; text-align: center; margin: 24px 0; }
        .otp-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #f472b6; letter-spacing: 2px; margin-bottom: 8px; }
        .otp-code { font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #ffffff; font-family: monospace; }
        .expiry { font-size: 11.5px; color: #94a3b8; margin-top: 8px; }
        .safety-note { background: rgba(16, 185, 129, 0.08); border-left: 3px solid #10b981; padding: 14px 16px; border-radius: 6px; margin: 20px 0; }
        .safety-title { font-weight: 700; color: #34d399; font-size: 12.5px; margin-bottom: 4px; }
        .safety-text { color: #cbd5e1; font-size: 12px; line-height: 1.5; margin: 0; }
        .terms-alert { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 12px 14px; color: #fca5a5; font-size: 11.5px; line-height: 1.4; margin-top: 18px; }
        .footer { border-top: 1px solid rgba(255, 255, 255, 0.06); padding: 18px 24px; text-align: center; color: #64748b; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🏛️ पी एम सी Leela</h1>
          <p>MANIT Bhopal • Campus Identity Verification</p>
        </div>
        <div class="content">
          <div class="greeting">Hello MANIT student,</div>
          <div class="text">
            Welcome to <strong>पी एम सी Leela</strong>. To ensure a safe, authentic, and verified community for MANIT students, please enter this OTP in the app:
          </div>
          
          <div class="otp-box">
            <div class="otp-label">Your Verification Code</div>
            <div class="otp-code">${otp}</div>
            <div class="expiry">⏱️ Valid for 10 minutes only. Do not share this with anyone.</div>
          </div>

          <div class="safety-note">
            <div class="safety-title">🛡️ Strict Anonymity & Safety Guarantee</div>
            <p class="safety-text">
              Your real name is not requested. Your phone number and official college email are used for campus authenticity & safety and are never revealed to other students. Only your campus persona is shown.
            </p>
          </div>

          <div class="terms-alert">
            ⚠️ <strong>Zero Tolerance Policy:</strong> Any harassment, nudity, or inappropriate content is strictly prohibited and subject to immediate account termination and reporting to the MANIT administration.
          </div>
        </div>
        <div class="footer">
          Maulana Azad National Institute of Technology (MANIT) Bhopal<br/>
          Piya Milan Chauraha & Leela Campus Stories
        </div>
      </div>
    </body>
    </html>
  `;

  if (!brevoApiKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[BREVO] BREVO_API_KEY is required in production.');
      return {
        success: false,
        error: 'Email verification is not configured. Please contact the app administrator.'
      };
    }

    console.log(`[BREVO] API key is not configured. Development OTP for ${toEmail}: ${otp}`);
    return {
      success: true,
      simulated: true,
      message: 'OTP generated (Brevo API key missing)',
      devOtp: otp
    };
  }

  try {
    console.log(`[BREVO] Sending verification email to ${toEmail} from ${fromName} <${fromEmail}>.`);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        'accept': 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: {
          name: fromName,
          email: fromEmail
        },
        to: [
          {
            email: toEmail
          }
        ],
        subject: `[${otp}] पी एम सी Leela - Your MANIT Email Verification Code`,
        htmlContent: htmlContent
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[BREVO] API Error (${response.status}):`, data);
      return {
        success: false,
        error: data.message || 'Brevo email delivery failed'
      };
    }

    console.log(`[BREVO] Email dispatched successfully! Message ID: ${data?.messageId}`);
    return {
      success: true,
      messageId: data?.messageId
    };
  } catch (err) {
    console.error(`[BREVO] Network exception:`, err);
    return {
      success: false,
      error: err.message
    };
  }
}

async function sendPasswordResetEmail(toEmail, otp) {
  const brevoApiKey = process.env.BREVO_API_KEY || '';
  const fromEmail = process.env.FROM_EMAIL || (
    process.env.NODE_ENV === 'production' ? '' : 'pmcleelaofficial@gmail.com'
  );
  const fromName = process.env.FROM_NAME || 'PMC लीला';
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="margin:0;padding:24px;background:#07080c;color:#f8fafc;font-family:Arial,sans-serif">
      <main style="max-width:520px;margin:auto;padding:28px;border-radius:18px;background:#111422">
        <h1 style="margin-top:0;color:#f472b6">PMC लीला password reset</h1>
        <p>Use this one-time code to set a new password for your account:</p>
        <p style="padding:18px;text-align:center;background:#0c0e17;border:1px dashed #ec4899;border-radius:12px;font-size:32px;font-weight:bold;letter-spacing:8px">${otp}</p>
        <p>This code expires in 10 minutes and can only be used once. If you did not request a password reset, ignore this email. Your existing password has not been sent or changed.</p>
      </main>
    </body>
    </html>
  `;

  if (!brevoApiKey || !fromEmail) {
    if (process.env.NODE_ENV === 'production') {
      const missing = [
        !brevoApiKey && 'BREVO_API_KEY',
        !fromEmail && 'FROM_EMAIL'
      ].filter(Boolean);
      console.error(`[BREVO] Password reset email configuration is missing: ${missing.join(', ')}.`);
      return { success: false, error: 'Email delivery is not configured. Check BREVO_API_KEY and the verified FROM_EMAIL in the backend environment.' };
    }
    console.log(`[BREVO] API key is not configured. Development password reset OTP for ${toEmail}: ${otp}`);
    return { success: true, simulated: true };
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoApiKey,
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: toEmail }],
        subject: 'PMC लीला - Password reset code',
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
      const error = typeof data.message === 'string' ? data.message : 'Email delivery failed.';
      console.error(`[BREVO] Password reset email failed (${response.status}): ${error}`);
      return { success: false, error };
    }
    console.info(`[BREVO] Password reset email accepted by Brevo${data.messageId ? ` (message ID: ${data.messageId})` : ''}.`);
    return { success: true, messageId: data?.messageId };
  } catch (error) {
    console.error('[BREVO] Password reset email network exception:', error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendOtpEmail,
  sendPasswordResetEmail
};
