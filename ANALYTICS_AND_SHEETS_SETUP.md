# Analytics, PageSpeed, GTM and Google Sheets

The admin dashboard uses first-party events stored in PostgreSQL. It does not read reporting data from an external analytics provider and does not need a Google Cloud project, service-account email, or private key.

## Backend environment

```dotenv
WEBSITE_URL="https://thepropertyportfolio.com.au"
PAGESPEED_API_KEY="optional-pagespeed-api-key"
ANALYTICS_SALT="a-long-random-secret"
GOOGLE_SHEETS_WEB_APP_URL="https://script.google.com/macros/s/DEPLOYMENT_ID/exec"
GOOGLE_SHEETS_WEBHOOK_SECRET="a-different-long-random-secret"
```

Generate secrets with `openssl rand -hex 32`.

## Google Sheet without Google Cloud

Open the required spreadsheet, select **Extensions → Apps Script**, and deploy a web app that accepts the enquiry JSON sent by the backend. Configure access so the backend can call the deployment URL, then place that URL and the same shared secret in the backend environment variables above.

```javascript
function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const expected = PropertiesService.getScriptProperties().getProperty("WEBHOOK_SECRET");
  if (!expected || payload.secret !== expected) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Unauthorized" })).setMimeType(ContentService.MimeType.JSON);
  }
  const r = payload.record || {};
  SpreadsheetApp.getActive().getSheetByName("Enquiries").appendRow([
    r.createdAt, r.kind, r.name, r.email, r.subject, r.message, r.source, r.id
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(ContentService.MimeType.JSON);
}
```

Create an `Enquiries` tab first. In Apps Script **Project Settings → Script properties**, add `WEBHOOK_SECRET` with the same value as the backend. Deploy as a web app executing as you, with access set to anyone who has the URL.

The database remains the primary store. A temporary Sheet failure is recorded without deleting the enquiry.

## PageSpeed

`PAGESPEED_API_KEY` is optional. A key provides more reliable quota. Page results are cached for 30 minutes per URL and device type. Website health checks are cached for five minutes.

## GTM

The public frontend loads the configured GTM container. Admin routes are excluded. The admin dashboard itself uses the website's first-party PostgreSQL events rather than GTM reporting data.
