-- ============================================================
-- 008 — Storage buckets for images
-- Run in: Supabase Dashboard → SQL Editor → New query
-- Run AFTER sql/007_payments.sql
-- ============================================================
-- Two buckets, deliberately different privacy levels:
--
--   driver-photos  PUBLIC  — a driver's face is shown to the customer on the
--                            tracking screen and to admins in list views, so a
--                            permanent URL is what we want. We store the full
--                            public URL in drivers.profile_picture_url.
--
--   order-proofs   PRIVATE — pickup/delivery photos are pictures of the inside
--                            of customers' homes, plus their handwritten
--                            signature. That is personal data, so it must not
--                            sit behind a permanent public link. We store the
--                            object PATH in orders.pickup_photos /
--                            delivery_photos / *_signature and mint a
--                            short-lived signed URL on every read
--                            (middleware/signStorageUrls.js).
--
-- No RLS policies are created on purpose. The API is the only thing that ever
-- touches storage, and it uses SUPABASE_SECRET_KEY (service role), which
-- bypasses RLS. Policies only matter when a browser/app talks to Supabase
-- directly with the anon key, which our clients never do — they upload through
-- POST /api/uploads/*. So "0 policies" on these buckets is correct, not a gap.
--
-- The size/MIME limits below are defence in depth: the upload endpoint already
-- rejects oversized and non-image files, this stops anything slipping past.
-- ============================================================

-- 10 MB, images only. Phone cameras produce 2–6 MB JPEGs, so 10 MB is roomy
-- without letting someone park a video in the bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-photos',
  'driver-photos',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'order-proofs',
  'order-proofs',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------
-- Verify
-- ------------------------------------------------------------
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('driver-photos', 'order-proofs')
ORDER BY id;
