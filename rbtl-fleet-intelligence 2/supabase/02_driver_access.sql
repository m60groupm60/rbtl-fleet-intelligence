-- Run after creating driver accounts in Supabase Authentication > Users.
-- Replace the sample UUID and inspector ID with the actual values.
-- Never assign a driver the manager role.

-- INSERT INTO public.profiles (id,full_name,role)
-- VALUES ('DRIVER_AUTH_UUID','Driver Name','driver')
-- ON CONFLICT (id) DO UPDATE SET full_name=excluded.full_name;

-- Map a driver's inspector ID to their DVIC inspections and assignments:
-- UPDATE public.dvic_inspections
-- SET driver_id='DRIVER_AUTH_UUID'
-- WHERE inspector_id='INSPECTOR_ID';
-- UPDATE public.driver_assignments
-- SET driver_id='DRIVER_AUTH_UUID'
-- WHERE inspector_id='INSPECTOR_ID';

-- Map alerts by vehicle AND date to avoid exposing other drivers' data.
-- Do this only after driver assignments are verified for each day.
-- UPDATE public.netradyne_alerts a SET driver_id=da.driver_id
-- FROM public.driver_assignments da
-- WHERE a.registration=da.registration
--   AND a.alert_date=da.assignment_date
--   AND da.driver_id IS NOT NULL
--   AND (SELECT count(DISTINCT d.driver_id)
--        FROM public.driver_assignments d
--        WHERE d.registration=a.registration
--          AND d.assignment_date=a.alert_date
--          AND d.driver_id IS NOT NULL)=1;
-- IMPORTANT: Multiple drivers sharing a van on the same day require manual review.
