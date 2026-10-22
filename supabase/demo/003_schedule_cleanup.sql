-- NEW DEMO PROJECT ONLY. The Edge Function must already be deployed.
-- Run step 1, copy the returned secret into Edge Function Secrets as
-- DMP_DEMO_CLEANUP_SECRET, then run step 2. Never place it in VITE variables.

-- STEP 1: create a private shared secret (run once; Vault retains it).
select vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,'dmp_demo_cleanup_secret')
where not exists(select 1 from vault.secrets where name='dmp_demo_cleanup_secret');
select decrypted_secret from vault.decrypted_secrets where name='dmp_demo_cleanup_secret';

-- STEP 2: enable the five-minute server cleanup. No browser tab is needed.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('dmp-demo-cleanup','*/5 * * * *',$job$
 select net.http_post(
   url:='https://xlhzyhotzfflemjnqvqn.supabase.co/functions/v1/public-demo-cleanup',
   headers:=jsonb_build_object('Content-Type','application/json','x-dmp-demo-cleanup',
     (select decrypted_secret from vault.decrypted_secrets where name='dmp_demo_cleanup_secret')),
   body:='{}'::jsonb,timeout_milliseconds:=50000
 );
$job$);

-- STEP 3: activate only after the two-visitor and cleanup acceptance tests.
-- update public.dmp_demo_config set enabled=true where id;
