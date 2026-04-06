# ContractFlow Suite

ContractFlow Suite is a desktop-first contract renewal management product designed to be sold with paid licenses. The repository contains a Windows desktop application built with Electron and a Node.js API that controls authentication, machine-bound licensing, customers, contracts, and dashboard metrics.

## What is included

- Desktop application ready to package as a Windows `.exe`
- API with JWT authentication and machine-bound license activation
- SQLite persistence for demo and local validation
- Customer and contract CRUD
- Revenue and renewal dashboard
- Seed data with a working demo account and license key

## Workspace layout

- `apps/api`: Express API, SQLite persistence, licensing, auth, and business rules
- `apps/desktop`: Electron + React desktop application
- `packages/shared`: shared TypeScript contracts

## Environment variables

- Desktop app (`apps/desktop/.env`):

	```bash
	VITE_API_URL=https://sua-api-producao.com
	VITE_LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
	```

	If `VITE_API_URL` is not provided, the app uses `http://localhost:4000`.

## Demo credentials

- Email: `owner@contractflow.local`
- Password: `admin123`
- License key: `CFLOW-DEMO-2026`

## Run locally

1. Install dependencies:

	```bash
	npm install
	```

2. Seed demo data:

	```bash
	npm run seed
	```

3. Start the API:

	```bash
	npm run dev -w apps/api
	```

4. In another terminal, start the desktop app:

	```bash
	npm run dev -w apps/desktop
	```

5. Login in the desktop app with the demo credentials above.

## Build

- Build all workspaces:

  ```bash
  npm run build
  ```

- Generate the Windows executable:

  ```bash
  npm run package:desktop
  ```

The generated executable is written to `apps/desktop/release/ContractFlow-Suite-1.0.0.exe`.

## Licensing model

- The user logs in with email, password, and license key.
- The API binds the license to the first machine identifier that uses it.
- Future logins from a different machine are blocked.
- License status and expiration are checked on every authenticated session.
- Session includes short-lived access token plus refresh token rotation.
- License administration routes are restricted to users with `owner` role.

## Offline-first mode (encrypted)

- After a successful online validation, the desktop app stores an encrypted local cache bound to the machine ID.
- If the API is temporarily unavailable, the app can operate from this encrypted cache.
- Test grace period is configured to **30 days** from the last successful online validation.
- If the grace period expires without online validation, offline access is blocked until the next online login.
- The dashboard shows notifications for:
	- upcoming renewal (up to 30 days before expiration)
	- expired license
	- remaining offline grace period

## Internal license issuer (separate tool)

This repository includes an internal CLI issuer in `apps/license-issuer`.

1. Generate signing keys (run once):

	```bash
	npm run license:generate-keys -- --outDir keys
	```

2. Configure desktop public key in `apps/desktop/.env` (`VITE_LICENSE_PUBLIC_KEY`).

3. Issue a signed license file:

	```bash
	npm run license:issue -- --privateKey keys/private_key.pem --output licenses/acme.lic --customer "Acme LTDA" --plan "Growth Annual" --expiresAt 2027-04-06T23:59:59.000Z --graceDays 30 --machineId <machine-id> --features contracts,renewals,dashboard
	```

4. In the desktop app, use **Importar licenca assinada (.lic)**.

## Commercialization notes

- For real sales, host `apps/api` on a VPS, Render, Railway, Fly.io, or another backend platform.
- Replace the SQLite database with PostgreSQL before going to production.
- Move `JWT_SECRET` and future payment keys to environment variables.
- Add an admin panel for issuing, suspending, and renewing licenses.
- Add payment integration such as Stripe, Mercado Pago, or Asaas to automate license lifecycle.
