const prisma = require("../config/database");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
}[character]));

function enquirySource(enquiry) {
  if (enquiry.source === "episode_page") {
    const episodeTitle = String(enquiry.message || "").match(/(?:^|\n)Suggested from episode:\s*(.+)$/im)?.[1]?.trim();
    return episodeTitle || "Episode page";
  }
  if (enquiry.source === "contact_page") return "Contact page";
  return String(enquiry.source || "Website").replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function enquiryMessage(enquiry) {
  return String(enquiry.message || "").replace(/\s*Suggested from episode:\s*.+$/is, "").trim();
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
  const source = enquirySource(enquiry);
  const message = enquiryMessage(enquiry);
  const text = [
    "A new enquiry was submitted on The Property Portfolio Podcast website.",
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Subject: ${enquiry.subject || ""}`,
    `Type: ${String(enquiry.kind || "Enquiry").replace(/_/g, " ")}`,
    `Source: ${source}`,
    "",
    `Message: ${message}`,
  ].join("\n");
  const fieldRow = (label, value) => `<tr><td style="padding:9px 12px 9px 0;color:#6b6174;font-size:13px;font-weight:700;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:9px 0;color:#24182c;font-size:14px;font-weight:600;line-height:1.5;word-break:break-word">${value}</td></tr>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background-color:#f7f3fb;color:#24182c;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f7f3fb;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e9def3;border-radius:18px;overflow:hidden;box-shadow:0 8px 28px rgba(52,20,76,.10)"><tr><td style="padding:28px 32px;background-color:#7d26c9;background-image:linear-gradient(115deg,#7d26c9 0%,#a52de0 52%,#e521c8 100%);color:#ffffff"><div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f5dfff">The Property Portfolio Podcast</div><h1 style="margin:12px 0 0;font-size:25px;line-height:1.25;color:#ffffff">New ${enquiry.kind === "TOPIC_SUGGESTION" ? "topic suggestion" : "website enquiry"}</h1><p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#fff4ff">A new message has arrived from your website.</p></td></tr><tr><td style="padding:26px 32px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${fieldRow("NAME", escapeHtml(enquiry.name))}${fieldRow("EMAIL", `<a href="mailto:${escapeHtml(enquiry.email)}" style="color:#7626bd;text-decoration:underline">${escapeHtml(enquiry.email)}</a>`)}${fieldRow("SUBJECT", escapeHtml(enquiry.subject || "—"))}${fieldRow("TYPE", escapeHtml(String(enquiry.kind || "Enquiry").replace(/_/g, " ")))}${fieldRow("SOURCE", `<span style="display:inline-block;padding:5px 10px;border-radius:10px;background-color:#f3e6ff;color:#542079;font-size:14px;font-weight:700;line-height:1.5;word-break:break-word">${escapeHtml(source)}</span>`)}</table></td></tr><tr><td style="padding:10px 32px 30px"><div style="border-top:1px solid #eee7f3;padding-top:20px"><div style="margin-bottom:10px;color:#4d4057;font-size:14px;font-weight:700">Message:</div><div style="padding:18px 20px;border:1px solid #eadcf4;border-left:4px solid #a52de0;border-radius:12px;background-color:#fbf9fd;color:#30243b;font-size:15px;line-height:1.7;white-space:pre-wrap;word-break:break-word">${escapeHtml(message)}</div></div><p style="margin:22px 0 0;color:#82788a;font-size:12px;line-height:1.6">Reply to this email to respond directly to ${escapeHtml(enquiry.name)}.</p></td></tr><tr><td style="padding:15px 32px;background-color:#f7f3fb;border-top:1px solid #eee7f3;color:#81788a;font-size:11px;line-height:1.5">Automated notification from thepropertyportfolio.com.au</td></tr></table></td></tr></table></body></html>`;
  return sendAdminNotification({ subject, text, html, replyTo: enquiry.email });
};

exports.notifyNewSubscriber = async (subscriber) => {
  const subject = "New website newsletter subscriber";
  const text = `A new subscriber signed up on The Property Portfolio Podcast website.\n\nEmail: ${subscriber.email}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${escapeHtml(subject)}</title></head><body style="margin:0;padding:0;background-color:#f7f3fb;color:#24182c;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f7f3fb;padding:28px 12px"><tr><td align="center"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e9def3;border-radius:18px;overflow:hidden"><tr><td style="padding:28px 32px;background-color:#7d26c9;background-image:linear-gradient(115deg,#7d26c9 0%,#a52de0 52%,#e521c8 100%);color:#ffffff"><div style="font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#f5dfff">The Property Portfolio Podcast</div><h1 style="margin:12px 0 0;font-size:25px;line-height:1.25;color:#ffffff">New newsletter subscriber</h1><p style="margin:8px 0 0;font-size:14px;line-height:1.6;color:#fff4ff">Someone joined your website mailing list.</p></td></tr><tr><td style="padding:26px 32px 30px"><div style="margin-bottom:8px;color:#6b6174;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">Email address</div><div style="padding:16px 18px;border:1px solid #eadcf4;border-left:4px solid #a52de0;border-radius:12px;background-color:#fbf9fd;color:#30243b;font-size:15px;line-height:1.6;word-break:break-word"><a href="mailto:${escapeHtml(subscriber.email)}" style="color:#7626bd;text-decoration:underline">${escapeHtml(subscriber.email)}</a></div></td></tr><tr><td style="padding:15px 32px;background-color:#f7f3fb;border-top:1px solid #eee7f3;color:#81788a;font-size:11px;line-height:1.5">Automated notification from thepropertyportfolio.com.au</td></tr></table></td></tr></table></body></html>`;
  return sendAdminNotification({ subject, text, html, replyTo: subscriber.email });
};
