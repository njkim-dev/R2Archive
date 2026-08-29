UPDATE users
SET default_visibility = 'private',
    updated_at = NOW()
WHERE default_visibility = 'anonymous';

UPDATE records
SET visibility = 'private'
WHERE visibility = 'anonymous';

DO $$
BEGIN
  IF to_regclass('public.pmang_achievements') IS NOT NULL THEN
    UPDATE pmang_achievements
    SET visibility = 'private'
    WHERE visibility = 'anonymous';
  END IF;
END $$;
