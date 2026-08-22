/**
 * Google Sheets integration through a deployed Apps Script web app.
 * No external analytics reporting credentials are used.
 */
async function appendContactToSheet(record) {
  const webhookUrl = (process.env.GOOGLE_SHEETS_WEB_APP_URL || "").trim();
  const webhookSecret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || "";
  if (!webhookUrl) return { skipped: true, reason: "Google Sheets Apps Script URL is not configured" };

  const sheetRecord = {
    createdAt: record.createdAt.toISOString(),
    kind: record.kind,
    name: record.name,
    email: record.email,
    subject: record.subject || "",
    message: record.message,
    source: record.source,
    id: record.id,
  };
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: webhookSecret, record: sheetRecord }),
  });
  const responseText = await response.text();
  let data;
  try { data = JSON.parse(responseText); } catch { data = null; }
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `Google Sheets webhook failed (${response.status})`);
  return { skipped: false, method: "apps-script" };
}

module.exports = { appendContactToSheet };
