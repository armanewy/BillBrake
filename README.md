# BillBrake Scan

BillBrake Scan is the revised BillBrake concept from the product brief:
import-first payment detection plus a Paycheck Map. The product starts from
artifacts users already have, then asks them to review detected payments before
showing which paychecks those payments hit.

## Implemented slice

- Import-first landing and app surface.
- Source selector for screenshot, PDF, CSV, pasted text, and forwarded email.
- CSV/text parsing prototype for candidate payments.
- Sample scan flow matching the revised design.
- Confirmation UI where users accept, edit, or ignore detected payments.
- Manual fallback for missing payments.
- Payday setup and Paycheck Map for accepted or edited detections.
- Supabase email/password auth.
- Saved income schedule, import batches, detected payments, and reviewed statuses.
- Strict JSON preview for the extraction output shape.
- Supabase migrations for app tables, import batches, detected payments, and
  private import-file storage policies.

PDF and screenshot upload are wired in the UI, but real OCR and LLM extraction
still need the server pipeline.

## Supabase setup

Run migrations in order from `supabase/migrations`:

1. `0001_initial_billbrake_scan.sql`
2. `0002_import_storage_policies.sql`

Create `.env.local` for local development:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

The `imports` storage bucket must be private. The second migration creates it
if it does not already exist and adds user-folder policies.

## Next build steps

- Add server text extraction for PDF/image sources.
- Add LLM parsing with strict JSON validation.
- Convert accepted detections into obligations and generated instances.
- Add PostHog events from the revised brief.
- Add Resend email reminders.

## Scripts

```bash
npm run dev
npm run lint
npm run build
```
