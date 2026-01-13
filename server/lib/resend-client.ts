// Resend email client integration
import { Resend } from 'resend';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return { apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email };
}

// WARNING: Never cache this client.
// Access tokens expire, so a new client must be created each time.
export async function getResendClient() {
  const { apiKey, fromEmail } = await getCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || 'noreply@linxora.com'
  };
}

export async function sendVerificationEmail(toEmail: string, verificationToken: string, username: string) {
  const { client, fromEmail } = await getResendClient();
  
  // Get the app URL from environment or construct from request
  const appUrl = process.env.REPLIT_DEV_DOMAIN 
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : process.env.REPLIT_DEPLOYMENT_URL || 'http://localhost:5000';
  
  const verificationUrl = `${appUrl}/verify-email?token=${verificationToken}`;
  
  const { data, error } = await client.emails.send({
    from: fromEmail,
    to: toEmail,
    subject: 'Verify your email address - Linxora',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
          <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h1 style="color: #18181b; font-size: 24px; margin: 0 0 16px;">Verify your email address</h1>
            <p style="color: #52525b; font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
              Hi ${username},
            </p>
            <p style="color: #52525b; font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
              You requested to change your email address on Linxora. Click the button below to verify this email address:
            </p>
            <a href="${verificationUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px;">
              Verify Email Address
            </a>
            <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 24px 0 0;">
              This link will expire in 24 hours. If you didn't request this change, you can safely ignore this email.
            </p>
            <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
            <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
              Linxora - Professional Freelancer Marketplace
            </p>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    console.error('Failed to send verification email:', error);
    throw new Error('Failed to send verification email');
  }

  return data;
}
