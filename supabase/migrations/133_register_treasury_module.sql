-- DoorManager Pro - register Treasury in canonical module visibility metadata.
begin;

insert into public.app_modules (code, label, sort_order)
values ('treasury', 'Tesorería', 105)
on conflict (code) do update set label = excluded.label, sort_order = excluded.sort_order, active = true;

commit;
