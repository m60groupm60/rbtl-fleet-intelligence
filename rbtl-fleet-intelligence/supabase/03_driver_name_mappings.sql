-- Driver directory was created separately in Supabase. No additional table is required.
-- Optional read-only check:
SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'driver_directory' ORDER BY ordinal_position;
