# RBTL Fleet Intelligence

Next.js 15 + Supabase + Vercel. Navy/blue dashboard with manager and driver access, DVIC records, Netradyne events, vehicle breakdown, date filters and CSV import.

## 1. Requirements
- Node.js 20+
- Existing Supabase project with tables and RLS policies created in step 1 of the conversation.
- Manager Supabase Auth account and `profiles` record with role `manager` (already configured).

## 2. Local setup
```bash
npm install
cp .env.example .env.local
npm run dev
```
Fill in `.env.local` values. `NEXT_PUBLIC_SUPABASE_URL` is prefilled. Use the **publishable** key for `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. For CSV import, `SUPABASE_SERVICE_ROLE_KEY` must be a **server-only secret/service-role** key; never put it in a `NEXT_PUBLIC_` variable, commit it to GitHub, or share it in chat.

Open http://localhost:3000 and sign in using the Supabase manager account.

## 3. Deploy to Vercel
1. Create a GitHub repository and upload the contents of this folder (not the ZIP itself).
2. Go to https://vercel.com/new and import the repository.
3. Framework: Next.js. Build command: `npm run build` (default).
4. Add environment variables in Vercel Project Settings > Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://rkiintzhoplvbofwdcck.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = your Supabase publishable key
   - `SUPABASE_SERVICE_ROLE_KEY` = your **secret** server-side key
5. Deploy. The app will be at your assigned `*.vercel.app` address.
6. If you change environment variables, redeploy.

## 4. Import the Google Sheets data
Manager > Import data. Export sheets using Google Sheets > File > Download > Comma Separated Values (.csv):
- `Vehicle Map`: headers `Vehicle ID`, `Registration` (or at least `Registration`).
- `Driver Assignments` (DVIC): `Date`, `Time`, `Registration`, `Inspector ID`, `Result`, `Inspection ID`, `Timestamp`, `VIN`.
- `Netradyne Data`: `Date`, `Registration`, `Alert Type`, `Description`, `Severity`, `Count`.
- Optional assignments CSV: `Date`, `Registration`, `Inspector ID`.

**Important:** The DVIC sheet may have hundreds of blank rows above the populated data. The importer skips empty rows. Dates must be ISO `YYYY-MM-DD` or UK `DD/MM/YYYY`.

DVIC import is deduplicated by inspection ID; vehicle import is upserted by registration. Alert and assignment imports append, so **do not upload the same CSV twice** unless you first clean up duplicates. This first release supports manual CSV imports, not automatic Google Sheets sync.

## 5. Driver logins and privacy
Create each driver in Supabase > Authentication > Users. Insert their `profiles` row with `role='driver'`. Then link the driver's actual Amazon inspector ID to the `driver_id` in DVIC and assignments using `supabase/02_driver_access.sql` as a guide. Map Netradyne alerts by *vehicle and date* only when the assignment is unambiguous. Until records have a matching `driver_id`, they remain invisible to drivers. The Supabase RLS policies enforce this server-side.

**Security note:** This first release intentionally does not offer public signup or browser-based privilege changes. Only managers can import. The secret key is used only inside the server-side import route after the signed-in manager role is checked. Use a new dedicated secret key and rotate any secret key accidentally exposed. Public publishable keys are safe to use in the browser with RLS enabled.

## 6. Notes and limitations
- Date-range queries are limited to 5,000 rows per table; use shorter date ranges for larger fleets.
- Driver identity is based on linked `driver_id`, not merely the vehicle registration. This prevents a driver from seeing another driver's records for a shared van.
- The manager view shows vehicle/driver names once records are mapped.
- Driver account provisioning, mapping and Netradyne data ingestion are administrator setup steps, not automatic in this release.
- The existing RLS rules must remain enabled. Do not expose service-role credentials in client code.
