# SMTP email notifications

The backend sends a notification after it stores a new enquiry or subscriber. The authenticated SMTP mailbox is both the sender and the default `To` address; the active admin profiles selected on **Admin → Enquiries → Email notification recipients** are added as CC. Enquiry messages use the visitor's address as `Reply-To`, so an admin can reply directly. Subscriber email is also used as `Reply-To`.

## Environment variables

Add these to the backend server's `.env` file. For a Gmail sender, use a Google App Password (with 2-Step Verification enabled), not the account password.

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=tppp2027@gmail.com
SMTP_PASS=eLvUN5VBacl5aWX4
SMTP_FROM=tppp2027@gmail.com
SMTP_FROM_NAME=The Property Portfolio Podcast
SMTP_TO=tppp2027@gmail.com
```

`SMTP_TO` is optional and defaults to `SMTP_USER`. Keep `SMTP_FROM` set to the authenticated mailbox (or an address the provider has authorized as a sender). For implicit TLS on port 465, set `SMTP_PORT=465` and `SMTP_SECURE=true`.

## Deploy on the server

From the backend directory, edit `.env` without putting real credentials in source control:

```sh
cd /path/to/podcast-backend
nano .env
```

Add the variables above with the real mailbox and app password, then apply the database migration, regenerate Prisma Client, and restart the PM2 app:

```sh
npm install
npm run build
npm run db:migrate
pm2 restart ecosystem.config.js --update-env
```

The migration creates the saved recipient selection. Select the admin profiles on the Enquiries page and save them after deployment. SMTP delivery failures are logged by the backend and do not undo a successfully stored enquiry or subscription.
