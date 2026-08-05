# Profile System Setup

## What This Adds

User profiles stored in PostgreSQL, linked to wallet addresses via SIWE authentication. Each profile includes identity fields (username, display name, email, bio, country), social links (Twitter/X, Telegram, Discord, GitHub, website), and an avatar stored as a base64 data URI.

- **Authorization**: Profile writes are gated by server-side session. The address is never taken from the request body — a user can only edit the profile belonging to the address they proved control of via SIWE.
- **Validation**: Shared between client and server so a field can never be accepted by one and rejected by the other. Username uniqueness is enforced at the database level.
- **Avatar handling**: Client-side downscaling to 256px keeps uploads under the storage limit rather than rejecting camera photos.
- **Completion meter**: Tracks five core fields (username, display name, avatar, bio, country) and shows percentage + missing items.

## Database Setup

### 1. Install and start PostgreSQL

**macOS (Homebrew)**:
```bash
brew install postgresql@16
brew services start postgresql@16
```

**Ubuntu/Debian**:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows**:
Download the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/), run it, and follow the setup wizard. The default port is 5432.

### 2. Create the database

```bash
# Connect as the postgres superuser
psql -U postgres

# Inside psql:
CREATE DATABASE arcflow;
CREATE USER arcflow_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE arcflow TO arcflow_user;
\q
```

### 3. Configure the connection string

Add to `.env.local`:
```env
DATABASE_URL="postgresql://arcflow_user:your_secure_password@localhost:5432/arcflow?schema=public"
```

**Production**: Replace `localhost:5432` with your managed database endpoint (e.g., Neon, Supabase, Railway, RDS). Never commit `.env.local`.

### 4. Run migrations

```bash
# Generate Prisma Client (already done during install if postinstall ran)
npx prisma generate

# Push the schema to the database (creates tables)
npx prisma db push

# Optional: open Prisma Studio to inspect data
npx prisma studio
```

`prisma db push` is for rapid prototyping. For production, use `prisma migrate dev` to generate versioned migration files that can be reviewed and applied in CI/CD.

## Files Added/Modified

### New Files
- `prisma/schema.prisma` — Prisma schema defining the `User` model
- `lib/prisma.ts` — PrismaClient singleton (prevents connection exhaustion during hot reload)
- `lib/profile.ts` — Shared types, validation, completion logic
- `lib/useProfile.ts` — Client hook for loading and saving profiles
- `app/api/profile/route.ts` — GET (read) and PUT (upsert) endpoints
- `app/api/profile/username/route.ts` — Username availability check (advisory, not authoritative)
- `app/profile/page.tsx` — Profile view and edit page
- `components/AvatarPicker.tsx` — Avatar upload with client-side downscaling
- `PROFILES.md` — This file

### Modified Files
- `package.json` — Added `prisma`, `@prisma/client`
- `lib/siwe.ts` — Exported `SESSION_COOKIE` constant to eliminate duplication
- `app/api/siwe/verify/route.ts` — Imports `SESSION_COOKIE` from `lib/siwe.ts`
- `app/api/siwe/nonce/route.ts` — Imports `SESSION_COOKIE` from `lib/siwe.ts`
- `app/api/siwe/session/route.ts` — Imports `SESSION_COOKIE` from `lib/siwe.ts`
- `components/Navbar.tsx` — Added Profile link
- `.gitignore` — Ignored `node_modules/.prisma/` and `prisma/migrations/dev.db*`

## Security Notes

1. **Session-derived address**: The profile API reads the address from the server-side session, never from the request body. A client can only modify the profile belonging to the address they authenticated with.

2. **SIWE authentication**: Profiles are gated behind SIWE. Connecting a wallet only reveals an address; signing a message proves control of that address.

3. **Address normalization**: PostgreSQL's default collation is case-**sensitive**, so `0xABC…` and `0xabc…` would be two distinct rows for the same wallet. The single thing preventing that is `createSession` in `lib/sessionStore.ts`, which lowercases before storing. Every profile lookup derives its address from that session, so all reads and writes agree on one casing. If a future code path ever queries by an address that did not come from the session, it must lowercase it first.

4. **Username races**: Two users can pass the availability check simultaneously, but only one can win — the database's unique constraint is the arbiter, not the client-side check. The API translates Prisma's `P2002` error into a user-friendly "username taken" message.

5. **Avatar storage**: Avatars are stored inline as data URIs. This trades scalability for simplicity: no object storage bucket, no signed-upload flow, no credential management. At 256px and JPEG quality 0.85, an avatar is ~10-30KB. For a production app with millions of users, move avatars to S3/GCS and store only the URL.

6. **Field limits**: Every text field has a length ceiling mirrored in the database schema and enforced in the API. Without these, a single malicious request could store a multi-megabyte bio and turn every profile read into a slow query.

7. **Input validation**: Shared validation between client and server. The client validates for immediate feedback; the server validates because the client can be bypassed entirely. A field can never be accepted by one and rejected by the other.

8. **Website URLs**: Only `http://` and `https://` schemes are allowed. A `javascript:` URL rendered into an anchor would execute when clicked, so the scheme is checked rather than trusted.

9. **Email field**: Never shown publicly, never sent to, and validation is deliberately permissive. The only claim being made is "this string looks like an address." Ownership is never assumed.

## Production Checklist

- [ ] Replace `prisma db push` with `prisma migrate dev` for versioned migrations
- [ ] Set `DATABASE_URL` in your production environment (do not commit it)
- [ ] Run `npx prisma migrate deploy` in your CI/CD pipeline
- [ ] Consider moving `sessionStore` from in-memory to Redis for multi-instance deployments
- [ ] If avatar traffic grows, migrate avatars to S3/GCS and update the schema to store URLs
- [ ] Add rate limiting to the profile and username endpoints (e.g., 10 requests/minute per IP)
- [ ] Monitor database query performance with `log: ['query']` during development, then disable in production
- [ ] Set up database backups (automatic in managed services; manual with `pg_dump` otherwise)

## Usage

1. Sign in with SIWE (Navbar → Connect → Sign)
2. Visit `/profile`
3. Click "Create profile" or "Edit profile"
4. Fill in the form (all fields optional)
5. Upload an avatar (optional; automatically downscaled to 256px)
6. Save

The completion meter tracks five core fields and shows percentage + missing items. The username is unique across all users; the API returns a conflict error if taken.
