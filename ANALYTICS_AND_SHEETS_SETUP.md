# Analytics, Lighthouse, GTM and Google Sheets

The admin dashboard uses first-party events stored in PostgreSQL. It does not read reporting data from an external analytics provider and does not need a Google Cloud project, service-account email, or private key.

## Backend environment

```dotenv
WEBSITE_URL="https://thepropertyportfolio.com.au"
LIGHTHOUSE_CHROME_PATH="optional-absolute-path-to-chrome"
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
  const sheet = SpreadsheetApp.getActive().getSheetByName("Enquiries");
  if (!sheet) return json({ ok: false, error: "The Enquiries tab does not exist" });

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = String(r.id || "");
    if (id && sheet.getLastRow() > 1) {
      const existing = sheet.getRange(2, 8, sheet.getLastRow() - 1, 1)
        .createTextFinder(id).matchEntireCell(true).findNext();
      if (existing) return json({ ok: true, duplicate: true });
    }
    sheet.appendRow([r.createdAt, r.kind, r.name, r.email, r.subject, r.message, r.source, r.id]);
    return json({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function json(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
```

Create an `Enquiries` tab first. In Apps Script **Project Settings → Script properties**, add `WEBHOOK_SECRET` with the same value as the backend. Deploy as a web app executing as you, with access set to anyone who has the URL.

The database remains the primary store. A temporary Sheet failure is recorded without deleting the enquiry.

## Self-hosted Lighthouse

Performance, accessibility, best-practices and SEO audits use the open-source Lighthouse package on the API server. There is no Google PageSpeed API key or third-party request quota. Install Chrome/Chromium on the API host; `chrome-launcher` normally discovers it automatically. Set `LIGHTHOUSE_CHROME_PATH` only when automatic discovery does not find the executable. Audit results are cached for 30 minutes per URL and device type. Website health checks are cached for five minutes.

## GTM

The public frontend loads the configured GTM container. Admin routes are excluded. Initial and client-side route changes push `virtual_page_view` with `page_path`, `page_location`, `page_title` and `page_referrer`; first-party events also push `tppp_analytics_event`. Configure the GTM container to trigger its GA4 page-view tag from `virtual_page_view`. The admin dashboard itself uses the website's first-party PostgreSQL events rather than GTM reporting data.

## Database and bootstrap super admin

Deploy migrations before starting the updated API, then run the idempotent seed:

```shell
npm run db:migrate
npm run db:seed
```

The seed promotes `utsav@proowrx.com` to super admin and hashes `SEED_ADMIN_PASSWORD`. The password variable is required and has no source-code fallback. `SEED_ADMIN_EMAIL` and `SEED_ADMIN_NAME` can override the default identity. Run the seed once, remove the seed password from the server environment, and rotate the initial password after the first login.
