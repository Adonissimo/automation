# InboxPilot

A single-owner email automation app with a working demo inbox and an optional Gmail connection. No third-party npm dependencies or AI API costs.

## Run locally

Install Node.js 24 or newer. From this directory:

```sh
npm start
```

Open http://localhost:3000. Run automation to classify the eight sample messages. Demo actions never send real email. Turn off Shadow mode and enable Clean up junk under Automation rules to test Trash and recovery.

```sh
npm test
```

## Connect Gmail

1. Copy `.env.example` to `.env`. Never commit `.env`.
2. Set `APP_PASSWORD` to a unique password of at least 20 characters. Login username is `admin`.
3. Generate `TOKEN_KEY` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep this key stable and backed up securely.
4. Create a Google Cloud project. Enable Gmail API. Configure Google Auth Platform's OAuth consent screen and add your Gmail account as a test user when the app is in Testing.
5. Create a Web application OAuth client. Add `http://localhost:3000/auth/callback` as an authorized redirect URI. Add your deployed HTTPS callback separately.
6. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Set `BASE_URL` to the exact app origin, with no trailing slash.
7. Restart the app. Click Connect Gmail. Grant the requested Gmail modify and send scopes.
8. Run in Shadow mode and inspect Activity log. Turn Shadow mode off only after reviewing decisions. Enable Clean up junk separately.

Gmail modify permission does not grant immediate permanent deletion. This app intentionally has no permanent-delete endpoint. The send permission is used only after explicit message approval. Google may require verification and a security assessment for public use of restricted Gmail scopes. External OAuth apps in Testing commonly have short-lived refresh grants; reconnect when needed. This is a private, single-account app, not a public multi-user service.

## Deploy on Render

Use a **paid Render Node web service with a persistent disk**. A free service's ephemeral filesystem cannot preserve this SQLite database reliably. Review current Render pricing before provisioning.

1. Push these source files to the confirmed GitHub repository. Keep `render.yaml` at the repository root.
2. In Render, create a Blueprint from that repository, or create a Node web service manually.
3. Build command: `npm install --omit=dev`. Start command: `npm start`. Node version: 24.16.0 or a newer supported Node 24 release.
4. Attach a 1 GB persistent disk at `/var/data`. Set `DATA_DIR=/var/data` and `NODE_ENV=production`.
5. Set `BASE_URL=https://YOUR-SERVICE.onrender.com`, a unique `APP_PASSWORD` of at least 20 characters, and a generated `TOKEN_KEY`. Add Google OAuth credentials when ready. Store all secrets in Render environment settings.
6. Add `https://YOUR-SERVICE.onrender.com/auth/callback` to the Google OAuth client's redirect URIs.
7. Deploy, open the HTTPS URL, log in as `admin`, and connect Gmail. Start in Shadow mode.

If Google credentials are omitted, the deployed app still works as a password-protected demo. Never expose a real mailbox as a public portfolio demo. Use a separate demo-only deployment. This repository includes deployment configuration, but creating a live service still requires your Render account and billing choices.

## Behavior and limits

- Rules run every minute while the server is running. Each run scans up to 50 Gmail messages; durable pagination progresses through larger inboxes. The current implementation polls complete pages rather than Gmail history events.
- Protected senders override all classification rules. Blocked senders match exact addresses. Blocking is an app cleanup rule, not Gmail's native sender-block setting.
- Gmail's SPAM label or an explicit blocked sender qualifies for cleanup. Newsletters are only labeled. Finance classification uses subject keywords and is not a verified financial-document detector.
- Shadow mode records proposed actions without changing Gmail or suppressing recipients. Classification labels in the dashboard are still updated locally.
- Active cleanup moves messages to Gmail Trash. Gmail normally permanently deletes Trash after 30 days. Restore only works while the Gmail message still exists; restoration protects the sender.
- Delivery reports must contain an inline `message/delivery-status` MIME part. Each recipient's enhanced status code determines the advice. Attachment-only or unusual provider formats may need manual review.
- Structured status 5.1.1 flags a recipient for review. Bounce reports can be forged, so suppression requires explicit owner approval from the report details. Remove suppression under Automation rules. No email retry or address correction happens automatically. Gmail may already retry temporary failures.
- Sending requires explicit approval. A durable unique send ID prevents reusing an attempted request. An uncertain result is never retried automatically; inspect Gmail Sent first. A new draft has a new ID and can still duplicate a previously sent message if you approve it again.
- Actions against Gmail and SQLite cannot share a transaction. Trash and label operations are repeatable after interrupted runs. Send attempts stay pending/unknown after ambiguous failures or crashes.
- The app renders email as text, never executes HTML, never fetches remote email images, and does not use an LLM. No measured accuracy claim is made.
- SQLite stores message bodies and activity history in plaintext on the server disk. OAuth tokens use AES-256-GCM encryption. Secure the disk and backups; rotating or losing TOKEN_KEY requires reconnecting Gmail.
- Disconnect erases locally stored Gmail messages, tokens, suppression records and send records. It does not revoke Google's grant. Revoke access in your Google Account as well.
- Browser access uses HTTP Basic authentication over HTTPS in production. There is no multi-user isolation, password reset, or shared-team access. Scale to one service instance; SQLite and process locks are designed for one worker.

## Architecture

`server.js` owns HTTP, OAuth, background polling and approved sending. `engine.js` owns classification, delivery-status parsing and token encryption. `store.js` owns SQLite. `public/` is the accessible, responsive dashboard. Tests cover decision boundaries and an end-to-end demo workflow.

Before production mailbox use, test with a dedicated account, review logs, verify restore behavior, and configure disk backups. Public portfolio screenshots should use the demo inbox.
