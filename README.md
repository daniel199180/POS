# POS

Next.js app configured for authentication with the self-hosted Appwrite
instance.

## Appwrite

- Project ID: `6a3edc1b003419265462`
- Project name: `pos`
- Endpoint: `https://agencia-appwrite.n2wanx.easypanel.host/v1`

The app includes a public login page and a private POS V1 home page with sign
out.

Authentication uses Appwrite SSR sessions:

- The browser posts credentials to `/api/auth/login`.
- Next.js creates the Appwrite session server-side.
- The session secret is stored in an HTTP-only cookie.
- Private pages read the cookie server-side with `client.setSession(...)`.

## Structure

- Auth routes live under `src/app/(auth)`.
- Private routes live under `src/app/(dashboard)`.
- Appwrite configuration lives in `src/lib/appwrite/config.js`.
- Browser SDK exports live in `src/lib/appwrite/client.js`.
- Server SDK helpers live in `src/lib/appwrite/server.js`.

Create `.env.local` from `.env.local.example` and set `APPWRITE_API_KEY` with a
server-side Appwrite API key. Keep that key out of browser code and commits.

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000.
