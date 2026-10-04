/**
 * Brevo (formerly Sendinblue) Transactional Email Service for MANIT Student OTP Verification
 */

/**
 * Send 6-Digit OTP Email to MANIT student email via Brevo
 * @param {string} toEmail - Student college email (scholarNO@stu.manit.ac.in)
 * @param {string} otp - 6-digit numeric OTP code
 * @param {string} studentName - Student's name (optional)
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendOtpEmail(toEmail, otp, studentName = 'MANITian') {
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
          <div class="greeting">Hello ${studentName || 'MANITian'},</div>
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
              Your real name, phone number, and official college email are strictly stored for campus authenticity & safety. <strong>They are never revealed to other students</strong>. Only your anonymous persona is shown.
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
            email: toEmail,
            name: studentName || 'MANIT Student'
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

module.exports = {
  sendOtpEmail
};
