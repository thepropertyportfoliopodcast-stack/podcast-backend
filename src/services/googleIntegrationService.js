/**
 * Google Sheets integration through a deployed Apps Script web app.
 * No external analytics reporting credentials are used.
 */
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const isRetryableSheetError = (error) => {
  const status = Number(error?.status || 0);
  return error?.name === "AbortError" || !status || status === 429 || status >= 500;
};

async function sendContactToSheet(webhookUrl, webhookSecret, sheetRecord) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret: webhookSecret, record: sheetRecord }),
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await response.text();
  let data;
  try { data = JSON.parse(responseText); } catch { data = null; }

  if (!response.ok) {
    const error = new Error(data?.error || `Google Sheets webhook failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (!data || data.ok !== true) {
    const looksLikeGoogleHtml = /<!doctype|<html|accounts\.google\.com/i.test(responseText);
    const error = new Error(looksLikeGoogleHtml
      ? "Google Sheets web app returned a Google sign-in page. Redeploy it with access set to Anyone."
      : data?.error || "Google Sheets webhook did not confirm that the row was added");
    error.status = 400;
    throw error;
  }
  return data;
}

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
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await sendContactToSheet(webhookUrl, webhookSecret, sheetRecord);
      return { skipped: false, method: "apps-script", attempts: attempt };
    } catch (error) {
      lastError = error;
      if (attempt === 3 || !isRetryableSheetError(error)) break;
      await wait(attempt * 500);
    }
  }
  throw lastError;
}

module.exports = { appendContactToSheet };
