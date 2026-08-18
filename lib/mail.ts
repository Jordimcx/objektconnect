import nodemailer from "nodemailer";

type MailInput = {
  fromName: string;
  fromAddress?: string | null;
  to: string;
  subject: string;
  text: string;
  calendarContent?: string | null;
};

export function getMailConfigurationStatus() {
  const host = process.env.SMTP_HOST?.trim() || "smtp.mail.me.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER?.trim() || "";
  const passwordConfigured = Boolean(process.env.SMTP_PASSWORD?.trim());

  return {
    configured: Boolean(host && port && user && passwordConfigured),
    host,
    port,
    user,
    passwordConfigured
  };
}

export async function verifyMailConnection() {
  const configuration = requiredConfiguration();
  await createTransport(configuration).verify();
  return configuration;
}

export async function sendMail(input: MailInput) {
  const configuration = requiredConfiguration();
  const fromAddress = input.fromAddress?.trim() || configuration.user;
  const transport = createTransport(configuration);
  const info = await transport.sendMail({
    from: { name: input.fromName, address: fromAddress },
    to: input.to,
    replyTo: fromAddress,
    subject: input.subject,
    text: input.text,
    html: textToHtml(input.text),
    icalEvent: input.calendarContent
      ? { method: "REQUEST", filename: "termin.ics", content: input.calendarContent }
      : undefined
  });
  return { messageId: info.messageId };
}

function requiredConfiguration() {
  const status = getMailConfigurationStatus();
  if (!status.user) throw new Error("Die SMTP-E-Mail-Adresse ist noch nicht konfiguriert.");
  if (!status.passwordConfigured) throw new Error("Das App-spezifische iCloud-Passwort fehlt noch.");
  if (!Number.isInteger(status.port) || status.port <= 0) throw new Error("Der SMTP-Port ist ungültig.");
  return status;
}

function createTransport(configuration: ReturnType<typeof requiredConfiguration>) {
  return nodemailer.createTransport({
    host: configuration.host,
    port: configuration.port,
    secure: configuration.port === 465,
    requireTLS: configuration.port !== 465,
    auth: { user: configuration.user, pass: process.env.SMTP_PASSWORD! }
  });
}

function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => {
      const escaped = escapeHtml(paragraph).replace(/\n/g, "<br>");
      const linked = escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" style="color:#0f8f7d">${url}</a>`);
      return `<p style="margin:0 0 16px;line-height:1.6">${linked}</p>`;
    })
    .join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]!);
}
