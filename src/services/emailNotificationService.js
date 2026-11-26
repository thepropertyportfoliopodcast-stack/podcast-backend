const nodemailer = require("nodemailer");
const prisma = require("../config/database");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character]));

let cachedTransporter;
function getTransporter() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT || 587);
  if (!host || !user || !pass || !Number.isInteger(port)) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465,
      auth: { user, pass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return cachedTransporter;
}

async function getCcRecipients() {
  const setting = await prisma.emailNotificationSetting.findUnique({ where: { id: 1 } });
  if (!setting?.adminIds?.length) return [];
  const admins = await prisma.user.findMany({
    where: { id: { in: setting.adminIds }, isActive: true },
    select: { email: true },
  });
  return admins.map((admin) => admin.email.trim().toLowerCase()).filter(Boolean);
}

async function sendAdminNotification({ subject, text, html, replyTo }) {
  const transporter = getTransporter();
  const fromAddress = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  const toAddress = process.env.SMTP_TO?.trim() || process.env.SMTP_USER?.trim();
  if (!transporter || !fromAddress || !toAddress) {
    console.warn("Email notification skipped: SMTP_HOST, SMTP_USER, SMTP_PASS and a valid sender are required.");
    return { sent: false, reason: "SMTP is not configured" };
  }

  const cc = [...new Set(await getCcRecipients())].filter((email) => email !== toAddress.toLowerCase());
  const result = await transporter.sendMail({
    from: { name: process.env.SMTP_FROM_NAME?.trim() || "The Property Portfolio Podcast", address: fromAddress },
    to: toAddress,
    ...(cc.length ? { cc } : {}),
    ...(replyTo ? { replyTo } : {}),
    subject,
    text,
    html,
  });
  console.info("Admin email notification sent", { messageId: result.messageId, recipientCount: 1 + cc.length });
  return { sent: true };
}

exports.notifyNewEnquiry = async (enquiry) => {
  const subject = `New website ${enquiry.kind === "TOPIC_SUGGESTION" ? "topic suggestion" : "enquiry"}: ${enquiry.subject || "No subject"}`;
  const text = [
    "A new enquiry was submitted on The Property Portfolio Podcast website.",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Subject: ${enquiry.subject || ""}`,
    `Type: ${enquiry.kind}`,
    `Source: ${enquiry.source || ""}`,
    "",
    enquiry.message,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2>New website enquiry</h2><p><b>Name:</b> ${escapeHtml(enquiry.name)}</p><p><b>Email:</b> ${escapeHtml(enquiry.email)}</p><p><b>Subject:</b> ${escapeHtml(enquiry.subject || "")}</p><p><b>Type:</b> ${escapeHtml(enquiry.kind)}</p><p><b>Source:</b> ${escapeHtml(enquiry.source || "")}</p><hr/><p style="white-space:pre-wrap">${escapeHtml(enquiry.message)}</p></div>`;
  return sendAdminNotification({ subject, text, html, replyTo: enquiry.email });
};

exports.notifyNewSubscriber = async (subscriber) => {
  const subject = "New website newsletter subscriber";
  const text = `A new subscriber signed up on The Property Portfolio Podcast website.\n\nEmail: ${subscriber.email}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2>New newsletter subscriber</h2><p><b>Email:</b> ${escapeHtml(subscriber.email)}</p></div>`;
  return sendAdminNotification({ subject, text, html, replyTo: subscriber.email });
};
