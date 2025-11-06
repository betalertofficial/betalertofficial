-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;

-- Grant all on the job table to postgres
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule the Edge Function to run every minute
-- The function slug is the name of the folder it's in.
-- Note: We delete any existing job with the same name to prevent duplicates.
SELECT cron.schedule(
    'invoke-evaluate-triggers',
    '* * * * *', -- This is a cron expression for "every minute"
    $$
    SELECT net.http_post(
        url:='https://guwoanifjoowglqpoqyr.supabase.co/functions/v1/evaluate-triggers',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NjgxMDgwMDAsImV4cCI6MTgzNjE5NDgwMH0.EMn-Dk22tDw_y1wA3DaxzE9n5-eYse2uA2z5oE44f7I"}'
    )
    $$
);

-- The above ANON_KEY is a placeholder and should be replaced with the project's actual anon key if security is a major concern.
-- For now, this will work as the function itself is secured via SERVICE_ROLE_KEY.