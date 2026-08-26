-- DoorManager Pro - a check result can only target a section of its own template.

begin;

create or replace function public.validate_check_section_result_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.checks c
    join public.check_templates t on t.id = c.template_id
    join public.check_template_sections s on s.template_id = c.template_id
    where c.id = new.check_id
      and c.company_id = new.company_id
      and s.id = new.section_id
      and (t.company_id = c.company_id or t.company_id is null)
  ) then
    raise exception 'La sección no pertenece a la plantilla asociada al check';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_section_results_template_integrity on public.check_section_results;
create trigger trg_check_section_results_template_integrity
  before insert or update of check_id, section_id on public.check_section_results
  for each row execute function public.validate_check_section_result_template();

revoke all on function public.validate_check_section_result_template() from public;
grant execute on function public.validate_check_section_result_template() to authenticated;

commit;
