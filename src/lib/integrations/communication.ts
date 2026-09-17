/**
 * Communication Tools — Email, SMS, Voice
 *
 * All communication goes through sandboxed API calls.
 * Agents never access SMTP servers or phone lines directly.
 *
 * Supported providers:
 *  - Email: Resend, SendGrid, Mailgun
 *  - SMS: Twilio, Vonage
 *  - Voice: Twilio, Vonage
 */

// ─── Email ────────────────────────────────────────────────────────────────────

export type EmailProvider = "resend" | "sendgrid" | "mailgun";

export interface EmailConfig {
  provider: EmailProvider;
  apiKey: string;
  from: string;
  /** Reply-to address. */
  replyTo?: string;
}

export interface EmailMessage {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  /** Plain text body (fallback). */
  text?: string;
  /** HTML body (preferred). */
  html?: string;
  /** Attachments (data URLs or HTTP URLs). */
  attachments?: Array<{
    filename: string;
    content: string; // base64 or data URL
    contentType?: string;
  }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: EmailProvider;
}

/** Send email via the configured provider. */
export async function sendEmail(
  config: EmailConfig,
  message: EmailMessage,
): Promise<EmailResult> {
  switch (config.provider) {
    case "resend":
      return sendViaResend(config, message);
    case "sendgrid":
      return sendViaSendGrid(config, message);
    case "mailgun":
      return sendViaMailgun(config, message);
  }
}

async function sendViaResend(config: EmailConfig, msg: EmailMessage): Promise<EmailResult> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.from,
        to: Array.isArray(msg.to) ? msg.to : [msg.to],
        cc: msg.cc,
        bcc: msg.bcc,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        reply_to: config.replyTo,
      }),
    });
    const data = await resp.json() as { id?: string; error?: { message?: string } };
    return {
      success: resp.ok,
      messageId: data.id,
      error: data.error?.message,
      provider: "resend",
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e), provider: "resend" };
  }
}

async function sendViaSendGrid(config: EmailConfig, msg: EmailMessage): Promise<EmailResult> {
  try {
    const resp = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{
          to: (Array.isArray(msg.to) ? msg.to : [msg.to]).map((e) => ({ email: e })),
          cc: msg.cc ? (Array.isArray(msg.cc) ? msg.cc : [msg.cc]).map((e) => ({ email: e })) : undefined,
          subject: msg.subject,
        }],
        from: { email: config.from },
        reply_to: config.replyTo ? { email: config.replyTo } : undefined,
        content: [
          ...(msg.text ? [{ type: "text/plain", value: msg.text }] : []),
          ...(msg.html ? [{ type: "text/html", value: msg.html }] : []),
        ],
      }),
    });
    return {
      success: resp.ok || resp.status === 202,
      messageId: resp.headers.get("x-message-id") ?? undefined,
      error: resp.ok ? undefined : await resp.text(),
      provider: "sendgrid",
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e), provider: "sendgrid" };
  }
}

async function sendViaMailgun(config: EmailConfig, msg: EmailMessage): Promise<EmailResult> {
  try {
    const formData = new URLSearchParams();
    formData.append("from", config.from);
    (Array.isArray(msg.to) ? msg.to : [msg.to]).forEach((e) => formData.append("to", e));
    formData.append("subject", msg.subject);
    if (msg.text) formData.append("text", msg.text);
    if (msg.html) formData.append("html", msg.html);

    const resp = await fetch("https://api.mailgun.net/v3/messages", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${btoa(`api:${config.apiKey}`)}`,
      },
      body: formData,
    });
    const data = await resp.json() as { id?: string; message?: string };
    return {
      success: resp.ok,
      messageId: data.id,
      error: resp.ok ? undefined : data.message,
      provider: "mailgun",
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e), provider: "mailgun" };
  }
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

export type SmsProvider = "twilio" | "vonage";

export interface SmsConfig {
  provider: SmsProvider;
  apiKey: string;
  /** Sender phone number (E.164 format). */
  from: string;
  /** Account SID (Twilio only). */
  accountSid?: string;
}

export interface SmsMessage {
  to: string; // E.164 format: +1234567890
  body: string;
  /** Max 160 chars for single SMS. */
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: SmsProvider;
}

/** Send SMS via the configured provider. */
export async function sendSms(
  config: SmsConfig,
  message: SmsMessage,
): Promise<SmsResult> {
  if (config.provider === "twilio") {
    return sendViaTwilioSms(config, message);
  }
  return sendViaVonageSms(config, message);
}

async function sendViaTwilioSms(config: SmsConfig, msg: SmsMessage): Promise<SmsResult> {
  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${config.accountSid}:${config.apiKey}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: msg.to,
          From: config.from,
          Body: msg.body,
        }),
      },
    );
    const data = await resp.json() as { sid?: string; error_message?: string };
    return {
      success: resp.ok,
      messageId: data.sid,
      error: data.error_message,
      provider: "twilio",
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e), provider: "twilio" };
  }
}

async function sendViaVonageSms(config: SmsConfig, msg: SmsMessage): Promise<SmsResult> {
  try {
    const resp = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        api_key: config.apiKey,
        to: msg.to,
        from: config.from,
        text: msg.body,
      }),
    });
    const data = await resp.json() as { messages?: Array<{ "message-id"?: string; errorText?: string }> };
    const first = data.messages?.[0];
    return {
      success: !!first && !first.errorText,
      messageId: first?.["message-id"],
      error: first?.errorText,
      provider: "vonage",
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e), provider: "vonage" };
  }
}

// ─── Voice ────────────────────────────────────────────────────────────────────

export interface VoiceCall {
  to: string;
  /** TwiML or URL returning TwiML (Twilio). */
  twiml?: string;
  /** Text-to-speech message (simplified interface). */
  say?: string;
  /** URL to call when call connects. */
  url?: string;
  /** Status callback URL. */
  statusCallback?: string;
}

export interface VoiceResult {
  success: boolean;
  callSid?: string;
  error?: string;
}

/** Initiate a voice call (Twilio). */
export async function makeVoiceCall(
  config: SmsConfig & { accountSid: string },
  call: VoiceCall,
): Promise<VoiceResult> {
  try {
    const resp = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          "Authorization": `Basic ${btoa(`${config.accountSid}:${config.apiKey}`)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: call.to,
          From: config.from,
          ...(call.twiml ? { Twiml: call.twiml } : {}),
          ...(call.url ? { Url: call.url } : {}),
          ...(call.statusCallback ? { StatusCallback: call.statusCallback } : {}),
        }),
      },
    );
    const data = await resp.json() as { sid?: string; error_message?: string };
    return {
      success: resp.ok,
      callSid: data.sid,
      error: data.error_message,
    };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}
