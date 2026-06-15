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
- Strict JSON preview for the extraction output shape.
- Initial Supabase schema migration for import batches and detected payments.

PDF and screenshot upload are wired in the UI, but real OCR and LLM extraction
still need the server pipeline.

## Next build steps

- Add Supabase Auth and persistence.
- Store uploaded files and import batches.
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
