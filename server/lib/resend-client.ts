// Email sending client. Providers, checked in order:
//   1. SENDGRID_API_KEY  (@sendgrid/mail HTTP API — authenticated domain,
//      e.g. em4731.linxova.com, must be verified via SendGrid Sender Auth)
//   2. RESEND_API_KEY    (Resend HTTP API, or the Replit connector fallback)
//   3. ZEPTOMAIL_TOKEN   (Zoho ZeptoMail HTTP API — keeps the Zoho account in
//      use without SMTP, so it works on the free Render tier)
//   4. ZOHO_SMTP_USER + ZOHO_SMTP_PASSWORD (Zoho Mail SMTP — smtppro.zoho.com)
//
// HTTPS providers are tried first on purpose. Render *free* web services block
// outbound traffic to SMTP ports 25, 465 and 587, and the block is a blackhole
// rather than a refusal: a Zoho send does not fail fast, it hangs until it
// times out, which made the Verify button spin for minutes. Zoho SMTP is kept
// last for local development and paid Render instances only.
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

// @sendgrid/mail is an OPTIONAL dependency: the module is imported lazily
// below only when SENDGRID_API_KEY is configured. This keeps the app from
// crashing at startup when the package isn't installed (e.g. Render deploys
// that only rely on Resend).
type SgMail = { setApiKey(key: string): void; send(msg: unknown): Promise<unknown> };
let sgMailCache: SgMail | null = null;
async function getSgMail(): Promise<SgMail | null> {
  if (sgMailCache) return sgMailCache;
  try {
    const mod = await import('@sendgrid/mail');
    sgMailCache = (mod.default ?? mod) as SgMail;
  } catch (err) {
    console.error('@sendgrid/mail package not installed — SendGrid provider unavailable:', (err as Error).message);
    sgMailCache = null;
  }
  return sgMailCache;
}

function getSendGridCredentials() {
  if (process.env.SENDGRID_API_KEY) {
    return {
      apiKey: process.env.SENDGRID_API_KEY,
      fromEmail: process.env.SENDGRID_FROM_EMAIL || 'noreply@linxova.com',
    };
  }
  return null;
}

let connectionSettings: any;

async function getResendCredentials() {
  // Preferred path: a standard RESEND_API_KEY provided via environment
  // (replit_connectors / connector secrets, a real .env, or shell env).
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      fromEmail: process.env.RESEND_FROM_EMAIL || connectionSettings?.settings?.from_email || 'noreply@linxova.com',
    };
  }

  // Replit connector fallback (only works when deployed on Replit with the
  // Resend connector installed).
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken || !hostname) {
    throw new Error('SENDGRID_API_KEY/RESEND_API_KEY not set and no Replit connector available');
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

// Resolve the browser-facing host while correcting localhost's port to the
// actual port that accepted the request (proxies can rewrite the Host header).
export function getVerificationRequestOrigin(protocol: string, host: string, listenerPort?: number): string {
  const origin = new URL(`${protocol}://${host}`);
  if (origin.protocol !== 'http:' && origin.protocol !== 'https:') {
    throw new Error('Unsupported verification request protocol');
  }
  if (!origin.username && !origin.password &&
      (origin.hostname === 'localhost' || origin.hostname === '127.0.0.1') &&
      Number.isInteger(listenerPort) && listenerPort! > 0 && listenerPort! <= 65535) {
    origin.port = String(listenerPort);
  }
  return origin.origin;
}

// Resolve the browser-facing origin from explicit configuration first, then
// the current request. A configured public origin is required for phone users
// to open local development verification links.
export function getVerificationAppUrl(requestOrigin?: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  const override = process.env.APP_BASE_URL;
  const looksLocal = override && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/i.test(override);

  if (isProd) return override && !looksLocal ? override : 'https://linxova.com';
  if (override && !looksLocal) return override;

  let localRequestOrigin: string | undefined;
  if (requestOrigin) {
    try {
      const origin = new URL(requestOrigin);
      if ((origin.protocol === 'http:' || origin.protocol === 'https:') && !origin.username && !origin.password) {
        if (origin.hostname !== 'localhost' && origin.hostname !== '127.0.0.1') return origin.origin;
        localRequestOrigin = origin.origin;
      }
    } catch {
      // Ignore malformed request origins and use the configured local default.
    }
  }
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  if (localRequestOrigin) return localRequestOrigin;
  if (override) return override;
  const port = Number(process.env.PORT);
  return `http://localhost:${Number.isInteger(port) && port > 0 ? port : 5006}`;
}

// WARNING: Never cache the Resend client.
// Access tokens expire, so a new client must be created each time.
export async function getResendClient() {
  const { apiKey, fromEmail } = await getResendCredentials();
  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || 'noreply@linxova.com'
  };
}

const htmlEmailTemplate = (username: string, verificationUrl: string) => `<!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="text-align: center; margin: 0 0 24px;">
            <img src="https://linxova.com/assets/logo-light-D4s3Nxh7.png" alt="Linxova" width="96" height="96" style="display: block; width: 96px; height: auto; max-width: 100%; margin: 0 auto; border: 0;">
          </div>
          <h1 style="color: #18181b; font-size: 24px; line-height: 1.3; margin: 0 0 16px;">Verify your email address</h1>
          <p style="color: #52525b; font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
            Hi ${username},
          </p>
          <p style="color: #52525b; font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
            You requested to change your email address on Linxova. Click the button below to verify this email address:
          </p>
          <a href="${verificationUrl}" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-weight: 500; font-size: 16px;">
            Verify Email Address
          </a>
          <p style="color: #71717a; font-size: 14px; line-height: 1.5; margin: 24px 0 0;">
            This link will expire in 24 hours. If you didn't request this change, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
          <p style="color: #a1a1aa; font-size: 12px; margin: 0;">
            Linxova - Professional Freelancer Marketplace
          </p>
        </div>
      </body>
    </html>`;

export async function sendVerificationEmail(toEmail: string, verificationToken: string, username: string, requestOrigin?: string) {
  const appUrl = getVerificationAppUrl(requestOrigin);
  const verificationUrl = `${appUrl.replace(/\/$/, '')}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const subject = 'Verify your email address - Linxova';
  const html = htmlEmailTemplate(username, verificationUrl);

  // Provider 1: SendGrid (HTTPS API — works on every Render tier).
  const sg = getSendGridCredentials();
  if (sg) {
    const sgMail = await getSgMail();
    if (!sgMail) {
      throw new Error('SendGrid selected but @sendgrid/mail is not installed');
    }
    sgMail.setApiKey(sg.apiKey);
    try {
      const [resp] = (await sgMail.send({
        from: sg.fromEmail,
        to: toEmail,
        replyTo: 'support@linxova.com',
        subject,
        html,
      })) as unknown as [unknown];
      return resp;
    } catch (err: any) {
      const detail = err?.response?.body || err?.message || err;
      console.error('SendGrid send failed:', detail);
      throw new Error('Failed to send verification email (SendGrid)');
    }
  }

  // Provider 2: Resend (HTTPS API — works on every Render tier). Only attempt
  // it when credentials exist, so a Zoho-only setup still reaches provider 3
  // instead of throwing a "not connected" error here.
  const hasResendKey = Boolean(process.env.RESEND_API_KEY);
  const hasReplitConnector = Boolean(
    process.env.REPLIT_CONNECTORS_HOSTNAME &&
    (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL)
  );
  if (hasResendKey || hasReplitConnector) {
    const { client, fromEmail } = await getResendClient();
    const { data, error } = await client.emails.send({
      from: fromEmail,
      to: toEmail,
      replyTo: 'support@linxova.com',
      subject,
      html,
    });

    if (error) {
      console.error('Failed to send verification email:', error);
      throw new Error('Failed to send verification email');
    }

    return data;
  }

  // Provider 3: Zoho ZeptoMail (HTTPS API). This is how the Zoho account can
  // still deliver mail from a free Render instance: Render blocks SMTP ports,
  // but the ZeptoMail REST API is plain HTTPS. Requires a reviewed ZeptoMail
  // account with linxova.com verified and a Send Mail token from its Agent.
  if (process.env.ZEPTOMAIL_TOKEN) {
    const host = (process.env.ZEPTOMAIL_API_HOST || 'https://api.zeptomail.com').replace(/\/$/, '');
    const fromEmail = process.env.ZEPTOMAIL_FROM_EMAIL || process.env.ZOHO_FROM_EMAIL || 'noreply@linxova.com';
    // The copied token may or may not already carry the scheme prefix.
    const rawToken = process.env.ZEPTOMAIL_TOKEN.trim();
    const authorization = /^zoho-enczapikey\s/i.test(rawToken)
      ? rawToken
      : `zoho-enczapikey ${rawToken}`;
    try {
      const response = await fetch(`${host}/v1.1/email`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          from: { address: fromEmail, name: 'Linxova' },
          to: [{ email_address: { address: toEmail } }],
          reply_to: [{ address: 'support@linxova.com' }],
          subject,
          htmlbody: html,
        }),
      });
      const payload = await response.text();
      if (!response.ok) {
        console.error('ZeptoMail send failed:', response.status, payload.slice(0, 500));
        throw new Error('Failed to send verification email (ZeptoMail)');
      }
      return payload;
    } catch (err: any) {
      if (String(err?.message || '').includes('ZeptoMail')) throw err;
      console.error('ZeptoMail request error:', err?.message || err);
      throw new Error('Failed to send verification email (ZeptoMail)');
    }
  }

  // Provider 4: Zoho Mail SMTP. Last resort: unusable on Render free web
  // services (SMTP ports blocked), kept for local development and paid
  // instances. The timeouts make a blocked port fail in seconds instead of
  // hanging the HTTP request until the browser gives up.
  if (process.env.ZOHO_SMTP_USER && process.env.ZOHO_SMTP_PASSWORD) {
    const host = process.env.ZOHO_SMTP_HOST || 'smtppro.zoho.com';
    const port = Number(process.env.ZOHO_SMTP_PORT || '465');
    const fromEmail = process.env.ZOHO_FROM_EMAIL || process.env.ZOHO_SMTP_USER;
    try {
      const transport = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        auth: {
          user: process.env.ZOHO_SMTP_USER,
          pass: process.env.ZOHO_SMTP_PASSWORD,
        },
      });
      const info = await transport.sendMail({
        from: fromEmail,
        to: toEmail,
        replyTo: 'support@linxova.com',
        subject,
        html,
      });
      return info;
    } catch (err: any) {
      console.error('Zoho SMTP send failed:', err?.message || err);
      throw new Error('Failed to send verification email (Zoho SMTP)');
    }
  }

  throw new Error('SENDGRID_API_KEY/RESEND_API_KEY not set and no Replit connector available');
}
