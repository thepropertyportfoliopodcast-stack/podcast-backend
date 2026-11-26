const prisma = require("../config/database");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character]));

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
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  const to = process.env.RESEND_TO?.trim() || process.env.SMTP_TO?.trim() || process.env.SMTP_USER?.trim();
  if (!apiKey || !from || !to) {
    console.warn("Email notification skipped: RESEND_API_KEY, RESEND_FROM and RESEND_TO are required.");
    return { sent: false, reason: "Resend is not configured" };
  }

  const cc = [...new Set(await getCcRecipients())].filter((email) => email !== to.toLowerCase());
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      from,
      to: [to],
      ...(cc.length ? { cc } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      text,
      html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.message || result.error || `Resend request failed (${response.status})`;
    throw new Error(message);
  }
  console.info("Admin email notification sent", { messageId: result.id, recipientCount: 1 + cc.length });
  return { sent: true, messageId: result.id };
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
