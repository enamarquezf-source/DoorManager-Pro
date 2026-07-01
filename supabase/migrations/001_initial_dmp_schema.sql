-- DoorManager Pro - Initial Supabase/PostgreSQL schema
-- Primera migracion completa para SAT de puertas automaticas.

create extension if not exists pgcrypto;

-- ============================================================
-- Funciones comunes, updated_at y seguridad futura con auth.uid()
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p where p.auth_user_id = auth.uid() limit 1;
  return v_profile_id;
end;
$$;

create or replace function public.current_company_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  select p.company_id into v_company_id from public.profiles p where p.auth_user_id = auth.uid() limit 1;
  return v_company_id;
end;
$$;

create or replace function public.has_role(role_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.profile_roles pr
    join public.roles r on r.id = pr.role_id
    join public.profiles p on p.id = pr.profile_id
    where p.auth_user_id = auth.uid()
      and r.name = role_name
  );
end;
$$;

-- ============================================================
-- Empresas, perfiles y roles
-- ============================================================

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint companies_name_unique unique (name)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('SAT','Comercial','Oficina','Gerencia','Tecnico')),
  description text,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  auth_user_id uuid unique,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  active boolean not null default true,
  primary_area text not null,
  hired_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_company_email_unique unique (company_id, email)
);

create table public.profile_roles (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, role_id)
);

-- ============================================================
-- Clientes, contactos, centros y acceso
-- ============================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  legal_name text not null,
  trade_name text,
  tax_id text,
  status text not null default 'Activo' check (status in ('Activo','Inactivo','Potencial','Bloqueado')),
  address text,
  city text,
  province text,
  postal_code text,
  country text not null default 'Espana',
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint clients_company_code_unique unique (company_id, code),
  constraint clients_company_tax_unique unique (company_id, tax_id)
);

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  client_id uuid not null references public.clients(id),
  first_name text not null,
  last_name text,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.access_requirements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  title text not null,
  description text not null,
  requires_prl boolean not null default false,
  requires_appointment boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  client_id uuid not null references public.clients(id),
  code text not null,
  name text not null,
  address text,
  city text,
  province text,
  postal_code text,
  country text not null default 'Espana',
  latitude numeric(10,7),
  longitude numeric(10,7),
  schedule text,
  access_requirement_id uuid references public.access_requirements(id),
  primary_contact_id uuid references public.client_contacts(id),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint sites_company_code_unique unique (company_id, code)
);

create table public.site_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  site_id uuid not null references public.sites(id),
  client_contact_id uuid references public.client_contacts(id),
  first_name text,
  last_name text,
  role text,
  email text,
  phone text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ============================================================
-- Equipos, componentes, historial de estado y fotografias
-- ============================================================

create table public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint equipment_types_name_unique unique (company_id, name)
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  client_id uuid not null references public.clients(id),
  site_id uuid not null references public.sites(id),
  equipment_type_id uuid not null references public.equipment_types(id),
  brand text,
  model text,
  serial_number text,
  installation_date date,
  internal_location text,
  status text not null default 'Operativo' check (status in ('Operativo','Averiado','Fuera de servicio','Pendiente de revision','Sustituido')),
  criticality text not null default 'Media' check (criticality in ('Baja','Media','Alta','Critica')),
  last_review_date date,
  next_review_date date,
  technical_config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint equipment_company_code_unique unique (company_id, code)
);

create table public.equipment_components (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  equipment_id uuid not null references public.equipment(id),
  component_type text not null check (component_type in ('Motor','Cuadro','Fotocelulas','Banda de seguridad','Activacion','Otros')),
  brand text,
  model text,
  serial_number text,
  installed_at date,
  status text not null default 'Operativo',
  technical_config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.equipment_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  equipment_id uuid not null references public.equipment(id),
  previous_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  reason text
);

-- Tabla generica de archivos, preparada para Supabase Storage. No guarda binarios.
create table public.files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  bucket text not null,
  path text not null,
  name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz not null default now(),
  description text,
  metadata jsonb not null default '{}'::jsonb,
  constraint files_bucket_path_unique unique (bucket, path)
);

create table public.equipment_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  equipment_id uuid not null references public.equipment(id),
  file_id uuid not null references public.files(id),
  taken_by uuid references public.profiles(id),
  taken_at timestamptz not null default now(),
  description text
);

-- ============================================================
-- Expedientes, eventos, enlaces y documentos propios del expediente
-- ============================================================

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  title text not null,
  description text,
  type text not null check (type in ('Averia','Mantenimiento','Obra','Inspeccion','Garantia','Reclamacion','Mejora','Comercial')),
  priority text not null default 'Normal' check (priority in ('Baja','Normal','Alta','Critica')),
  status text not null default 'Abierto' check (status in ('Abierto','En curso','Pendiente','Cerrado','Cancelado')),
  client_id uuid not null references public.clients(id),
  site_id uuid references public.sites(id),
  responsible_profile_id uuid references public.profiles(id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  origin text not null check (origin in ('SAT','Comercial','Gerencia','Aviso','Check','Visita','Cliente','Sistema')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cases_company_code_unique unique (company_id, code)
);

create table public.case_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  case_id uuid not null references public.cases(id),
  event_type text not null,
  description text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.case_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  case_id uuid not null references public.cases(id),
  related_type text not null check (related_type in ('Equipo','Parte','Check','Aviso','Documento','Presupuesto','Incidencia','Oportunidad')),
  related_id uuid not null,
  created_at timestamptz not null default now(),
  constraint case_links_unique unique (case_id, related_type, related_id)
);

create table public.case_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  case_id uuid not null references public.cases(id),
  file_id uuid not null references public.files(id),
  title text not null,
  document_type text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- Partes de trabajo, asignaciones, estados, notas, fotos y firmas
-- ============================================================

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  case_id uuid references public.cases(id),
  client_id uuid not null references public.clients(id),
  site_id uuid not null references public.sites(id),
  main_equipment_id uuid references public.equipment(id),
  title text not null,
  description text,
  type text not null check (type in ('Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia')),
  priority text not null default 'Normal' check (priority in ('Baja','Normal','Alta','Critica')),
  status text not null default 'Pendiente' check (status in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado')),
  origin text not null check (origin in ('SAT','Comercial','Gerencia','Aviso','Check','Visita','Cliente','Sistema')),
  scheduled_date date,
  scheduled_time time,
  estimated_duration_minutes integer check (estimated_duration_minutes is null or estimated_duration_minutes > 0),
  main_technician_id uuid references public.profiles(id),
  technical_team text,
  contact_id uuid references public.client_contacts(id),
  access_requirement_id uuid references public.access_requirements(id),
  planned_material text,
  diagnosis text,
  work_performed text,
  result text,
  finished_at timestamptz,
  sent_at timestamptz,
  created_by uuid references public.profiles(id),
  created_role text not null check (created_role in ('SAT','Comercial','Oficina','Gerencia','Tecnico')),
  updated_by uuid references public.profiles(id),
  current_responsible_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_orders_company_code_unique unique (company_id, code)
);

create table public.work_order_equipment (
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  equipment_id uuid not null references public.equipment(id),
  company_id uuid not null references public.companies(id),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (work_order_id, equipment_id)
);

create table public.work_order_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  technician_id uuid not null references public.profiles(id),
  assignment_date date not null,
  planned_start_time time,
  planned_end_time time,
  role text not null default 'Principal' check (role in ('Principal','Apoyo')),
  status text not null default 'Asignado' check (status in ('Asignado','Descargado','En curso','Finalizado','No terminado','Cancelado')),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_order_assignment_unique unique (work_order_id, technician_id, assignment_date)
);

create table public.work_order_status_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  previous_status text,
  new_status text not null,
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  reason text,
  manual_correction boolean not null default false,
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  is_active_return_request boolean not null default false
);

create unique index work_order_one_active_return_request
  on public.work_order_status_history(work_order_id)
  where new_status = 'Devolucion solicitada' and is_active_return_request = true;

create table public.work_order_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  note text not null,
  visibility text not null default 'Interna' check (visibility in ('Interna','Cliente','Tecnica','Comercial')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.work_order_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  file_id uuid not null references public.files(id),
  taken_by uuid references public.profiles(id),
  taken_at timestamptz not null default now(),
  description text
);

create table public.work_order_signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  signer_name text not null,
  signer_role text,
  signer_document text,
  file_id uuid references public.files(id),
  signed_at timestamptz not null default now(),
  accepted_terms boolean not null default true
);

-- ============================================================
-- Checks: plantillas, resultados y fotos
-- ============================================================

create table public.check_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  equipment_type_id uuid references public.equipment_types(id),
  name text not null,
  version text not null default '1.0',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_templates_unique unique (company_id, name, version)
);

create table public.check_template_sections (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.check_templates(id) on delete cascade,
  title text not null,
  position integer not null check (position > 0),
  created_at timestamptz not null default now(),
  constraint check_template_sections_unique unique (template_id, position)
);

create table public.check_template_items (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.check_template_sections(id) on delete cascade,
  title text not null,
  component text not null,
  position integer not null check (position > 0),
  mandatory boolean not null default true,
  created_at timestamptz not null default now(),
  constraint check_template_items_unique unique (section_id, position)
);

create table public.checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  work_order_id uuid references public.work_orders(id),
  equipment_id uuid not null references public.equipment(id),
  template_id uuid not null references public.check_templates(id),
  technician_id uuid references public.profiles(id),
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'Por realizar' check (status in ('Por realizar','En curso','Realizado','Cancelado')),
  global_result text not null default 'Sin revisar' check (global_result in ('Sin revisar','Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable')),
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint checks_company_code_unique unique (company_id, code)
);

create table public.check_section_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  check_id uuid not null references public.checks(id) on delete cascade,
  section_id uuid not null references public.check_template_sections(id),
  result text not null default 'Sin revisar' check (result in ('Sin revisar','Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable')),
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_section_results_unique unique (check_id, section_id)
);

create table public.check_item_results (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  check_id uuid not null references public.checks(id) on delete cascade,
  section_result_id uuid references public.check_section_results(id) on delete cascade,
  item_id uuid not null references public.check_template_items(id),
  result text not null default 'Sin revisar' check (result in ('Sin revisar','Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable')),
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint check_item_results_unique unique (check_id, item_id)
);

create table public.check_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  check_id uuid not null references public.checks(id),
  item_result_id uuid references public.check_item_results(id),
  file_id uuid not null references public.files(id),
  taken_by uuid references public.profiles(id),
  taken_at timestamptz not null default now(),
  description text
);

-- ============================================================
-- Deficiencias y acciones correctivas
-- ============================================================

create table public.deficiencies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  check_id uuid references public.checks(id),
  section_id uuid references public.check_template_sections(id),
  item_id uuid references public.check_template_items(id),
  work_order_id uuid references public.work_orders(id),
  equipment_id uuid not null references public.equipment(id),
  client_id uuid not null references public.clients(id),
  site_id uuid not null references public.sites(id),
  severity text not null check (severity in ('Baja','Media','Alta','Critica')),
  description text not null,
  photo_file_id uuid references public.files(id),
  recommended_action text,
  status text not null default 'Detectada' check (status in ('Detectada','Pendiente de valoracion','En valoracion','Presupuestada','Aceptada','Rechazada','Corregida','Cerrada')),
  responsible_profile_id uuid references public.profiles(id),
  due_date date,
  origin_alert_id uuid,
  origin_work_order_id uuid,
  origin_opportunity_id uuid,
  origin_quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint deficiencies_company_code_unique unique (company_id, code)
);

create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  deficiency_id uuid not null references public.deficiencies(id),
  description text not null,
  status text not null default 'Pendiente' check (status in ('Pendiente','Planificada','En curso','Realizada','Cancelada')),
  responsible_profile_id uuid references public.profiles(id),
  planned_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Avisos
-- ============================================================

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  title text not null,
  description text,
  type text not null check (type in ('Operativo','Tecnico','Comercial','Administrativo','PRL','Material','Documentacion','Critico')),
  priority text not null default 'Normal' check (priority in ('Baja','Normal','Alta','Critica')),
  status text not null default 'Abierto' check (status in ('Abierto','En curso','Cerrado','Cancelado')),
  related_entity text,
  related_id uuid,
  alert_date timestamptz not null default now(),
  closed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint alerts_company_code_unique unique (company_id, code)
);

create table public.alert_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  alert_id uuid not null references public.alerts(id) on delete cascade,
  recipient_profile_id uuid references public.profiles(id),
  recipient_role text check (recipient_role in ('SAT','Comercial','Oficina','Gerencia','Tecnico')),
  is_read boolean not null default false,
  read_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint alert_recipient_target check (recipient_profile_id is not null or recipient_role is not null)
);

-- ============================================================
-- Documentacion enlazable
-- ============================================================

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  title text not null,
  type text not null check (type in ('Manual de instalacion','Manual de mantenimiento','Manual de motor','Manual de cuadro','Esquema electrico','Despiece','Declaracion CE','Instrucciones de desbloqueo','Procedimiento interno','Ficha tecnica')),
  version text,
  document_date date,
  valid boolean not null default true,
  origin text,
  file_id uuid references public.files(id),
  url text,
  available_offline boolean not null default false,
  observations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_file_or_url check (file_id is not null or url is not null)
);

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  document_id uuid not null references public.documents(id) on delete cascade,
  related_type text not null check (related_type in ('Cliente','Centro','Equipo','Tipo de equipo','Marca','Modelo','Motor','Cuadro','Expediente','Parte','Check')),
  related_id uuid,
  related_value text,
  created_at timestamptz not null default now(),
  constraint document_links_target check (related_id is not null or related_value is not null),
  constraint document_links_unique unique (document_id, related_type, related_id, related_value)
);

-- ============================================================
-- Materiales y almacen
-- ============================================================

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null,
  tax_id text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  description text not null,
  manufacturer text,
  reference text,
  unit text not null default 'ud',
  cost numeric(12,2) not null default 0 check (cost >= 0),
  price numeric(12,2) not null default 0 check (price >= 0),
  minimum_stock numeric(12,2) not null default 0 check (minimum_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint materials_company_code_unique unique (company_id, code)
);

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  name text not null,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint warehouses_company_code_unique unique (company_id, code)
);

create table public.warehouse_stock (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  warehouse_id uuid not null references public.warehouses(id),
  material_id uuid not null references public.materials(id),
  quantity numeric(12,2) not null default 0,
  reserved_quantity numeric(12,2) not null default 0 check (reserved_quantity >= 0),
  updated_at timestamptz not null default now(),
  constraint warehouse_stock_unique unique (warehouse_id, material_id)
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  warehouse_id uuid not null references public.warehouses(id),
  material_id uuid not null references public.materials(id),
  movement_type text not null check (movement_type in ('Entrada','Salida','Reserva','Devolucion','Ajuste','Consumo en parte')),
  quantity numeric(12,2) not null,
  work_order_id uuid references public.work_orders(id),
  supplier_id uuid references public.suppliers(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  notes text
);

create table public.material_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid references public.work_orders(id),
  requested_by uuid references public.profiles(id),
  status text not null default 'Pendiente' check (status in ('Pendiente','Aprobada','Preparada','Entregada','Cancelada')),
  needed_by date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.work_order_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  work_order_id uuid not null references public.work_orders(id),
  material_id uuid not null references public.materials(id),
  planned_quantity numeric(12,2) not null default 0,
  used_quantity numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Comercial basico: oportunidades y presupuestos
-- ============================================================

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  origin text not null check (origin in ('Visita','Deficiencia','Check','Parte','Cliente','Renovacion')),
  title text not null,
  description text,
  client_id uuid not null references public.clients(id),
  site_id uuid references public.sites(id),
  equipment_id uuid references public.equipment(id),
  case_id uuid references public.cases(id),
  responsible_profile_id uuid references public.profiles(id),
  status text not null default 'Nueva' check (status in ('Nueva','En estudio','Pendiente de valoracion','Presupuestada','Ganada','Perdida','Cerrada')),
  estimated_amount numeric(12,2) default 0,
  source_related_type text,
  source_related_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint opportunities_company_code_unique unique (company_id, code)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text not null,
  opportunity_id uuid references public.opportunities(id),
  client_id uuid not null references public.clients(id),
  site_id uuid references public.sites(id),
  case_id uuid references public.cases(id),
  title text not null,
  status text not null default 'Borrador' check (status in ('Borrador','Enviado','Aceptado','Rechazado','Caducado','Cancelado')),
  issue_date date not null default current_date,
  valid_until date,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint quotes_company_code_unique unique (company_id, code)
);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position integer not null check (position > 0),
  material_id uuid references public.materials(id),
  description text not null,
  quantity numeric(12,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  discount_percent numeric(5,2) not null default 0 check (discount_percent >= 0 and discount_percent <= 100),
  total numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  constraint quote_lines_unique unique (quote_id, position)
);

alter table public.deficiencies
  add constraint deficiencies_origin_alert_fk foreign key (origin_alert_id) references public.alerts(id),
  add constraint deficiencies_origin_work_order_fk foreign key (origin_work_order_id) references public.work_orders(id),
  add constraint deficiencies_origin_opportunity_fk foreign key (origin_opportunity_id) references public.opportunities(id),
  add constraint deficiencies_origin_quote_fk foreign key (origin_quote_id) references public.quotes(id);

-- ============================================================
-- Auditoria funcional y tecnica
-- ============================================================

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  actor_profile_id uuid references public.profiles(id),
  action text not null check (action in ('creacion','modificacion','eliminacion logica','cambio de estado','asignacion','cierre','reapertura')),
  entity_type text not null,
  entity_id uuid,
  description text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  table_name text not null,
  record_id uuid,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE','SOFT_DELETE')),
  changed_by uuid references public.profiles(id),
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

-- ============================================================
-- Indices para busquedas frecuentes
-- ============================================================

create index profiles_company_idx on public.profiles(company_id);
create index clients_search_idx on public.clients(company_id, code, legal_name, trade_name);
create index contacts_client_idx on public.client_contacts(client_id);
create index sites_client_idx on public.sites(client_id);
create index equipment_site_status_idx on public.equipment(company_id, site_id, status);
create index equipment_next_review_idx on public.equipment(company_id, next_review_date);
create index cases_status_idx on public.cases(company_id, status, priority);
create index work_orders_status_idx on public.work_orders(company_id, status, scheduled_date);
create index work_orders_responsible_idx on public.work_orders(company_id, current_responsible_id);
create index assignments_technician_day_idx on public.work_order_assignments(company_id, technician_id, assignment_date);
create index checks_status_idx on public.checks(company_id, status, technician_id);
create index deficiencies_status_idx on public.deficiencies(company_id, status, severity);
create index alerts_status_idx on public.alerts(company_id, status, priority);
create index alert_recipients_unread_idx on public.alert_recipients(company_id, recipient_profile_id, is_read);
create index documents_type_idx on public.documents(company_id, type, valid);
create index stock_material_idx on public.warehouse_stock(company_id, material_id);
create index opportunities_status_idx on public.opportunities(company_id, status);
create index quotes_status_idx on public.quotes(company_id, status);
create index activity_log_entity_idx on public.activity_log(entity_type, entity_id, created_at desc);

-- ============================================================
-- Triggers updated_at
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','profiles','clients','client_contacts','access_requirements','sites','site_contacts',
    'equipment','equipment_components','cases','work_orders','work_order_assignments',
    'check_templates','checks','check_section_results','check_item_results','deficiencies','corrective_actions',
    'alerts','documents','suppliers','materials','warehouses','material_requests','work_order_materials',
    'opportunities','quotes'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_set_updated_at', t);
  end loop;
end $$;

-- ============================================================
-- Vistas operativas
-- ============================================================

create view public.v_technician_daily_schedule as
select a.company_id, a.assignment_date, a.planned_start_time, a.planned_end_time, a.status as assignment_status,
       p.id as technician_id, p.first_name || ' ' || p.last_name as technician_name,
       wo.id as work_order_id, wo.code as work_order_code, wo.title, wo.status as work_order_status,
       c.legal_name as client_name, s.name as site_name, e.code as equipment_code
from public.work_order_assignments a
join public.profiles p on p.id = a.technician_id
join public.work_orders wo on wo.id = a.work_order_id
join public.clients c on c.id = wo.client_id
join public.sites s on s.id = wo.site_id
left join public.equipment e on e.id = wo.main_equipment_id;

create view public.v_open_work_orders as
select wo.*, c.legal_name as client_name, s.name as site_name, p.first_name || ' ' || p.last_name as responsible_name
from public.work_orders wo
join public.clients c on c.id = wo.client_id
join public.sites s on s.id = wo.site_id
left join public.profiles p on p.id = wo.current_responsible_id
where wo.deleted_at is null and wo.status not in ('Cerrado','Cancelado');

create view public.v_work_order_full_detail as
select wo.id, wo.company_id, wo.code, wo.title, wo.description, wo.type, wo.priority, wo.status, wo.origin,
       wo.scheduled_date, wo.scheduled_time, wo.diagnosis, wo.work_performed, wo.result,
       ca.code as case_code, c.code as client_code, c.legal_name as client_name, s.code as site_code, s.name as site_name,
       e.code as equipment_code, et.name as equipment_type,
       tech.first_name || ' ' || tech.last_name as main_technician_name,
       creator.first_name || ' ' || creator.last_name as created_by_name
from public.work_orders wo
left join public.cases ca on ca.id = wo.case_id
join public.clients c on c.id = wo.client_id
join public.sites s on s.id = wo.site_id
left join public.equipment e on e.id = wo.main_equipment_id
left join public.equipment_types et on et.id = e.equipment_type_id
left join public.profiles tech on tech.id = wo.main_technician_id
left join public.profiles creator on creator.id = wo.created_by;

create view public.v_equipment_history as
select company_id, equipment_id, 'estado' as event_type, changed_at as event_at, new_status as summary, reason as detail from public.equipment_status_history
union all
select company_id, main_equipment_id, 'parte', created_at, code || ' - ' || title, status from public.work_orders where main_equipment_id is not null
union all
select company_id, equipment_id, 'check', created_at, code, global_result from public.checks
union all
select company_id, equipment_id, 'deficiencia', created_at, code, description from public.deficiencies;

create view public.v_pending_checks as
select ch.*, e.code as equipment_code, wo.code as work_order_code
from public.checks ch
join public.equipment e on e.id = ch.equipment_id
left join public.work_orders wo on wo.id = ch.work_order_id
where ch.deleted_at is null and ch.status in ('Por realizar','En curso');

create view public.v_completed_checks as
select ch.*, e.code as equipment_code, p.first_name || ' ' || p.last_name as technician_name
from public.checks ch
join public.equipment e on e.id = ch.equipment_id
left join public.profiles p on p.id = ch.technician_id
where ch.deleted_at is null and ch.status = 'Realizado';

create view public.v_unread_alerts as
select ar.company_id, ar.id as recipient_id, ar.recipient_profile_id, ar.recipient_role, a.id as alert_id, a.code, a.title, a.type, a.priority, a.alert_date
from public.alert_recipients ar
join public.alerts a on a.id = ar.alert_id
where ar.is_read = false and a.status <> 'Cerrado';

create view public.v_sat_dashboard as
select c.id as company_id,
       count(wo.*) filter (where wo.status not in ('Cerrado','Cancelado')) as open_work_orders,
       count(wo.*) filter (where wo.status = 'Pendiente') as pending_work_orders,
       count(ch.*) filter (where ch.status in ('Por realizar','En curso')) as pending_checks,
       count(d.*) filter (where d.status not in ('Corregida','Cerrada','Rechazada')) as open_deficiencies,
       count(a.*) filter (where a.status = 'Abierto') as open_alerts
from public.companies c
left join public.work_orders wo on wo.company_id = c.id and wo.deleted_at is null
left join public.checks ch on ch.company_id = c.id and ch.deleted_at is null
left join public.deficiencies d on d.company_id = c.id and d.deleted_at is null
left join public.alerts a on a.company_id = c.id and a.deleted_at is null
group by c.id;

create view public.v_management_metrics as
select c.id as company_id,
       count(distinct cl.id) as clients,
       count(distinct e.id) as equipment,
       count(distinct wo.id) filter (where wo.created_at >= date_trunc('month', now())) as work_orders_this_month,
       count(distinct q.id) filter (where q.status = 'Aceptado') as accepted_quotes,
       coalesce(sum(q.total) filter (where q.status = 'Aceptado'), 0) as accepted_quote_amount
from public.companies c
left join public.clients cl on cl.company_id = c.id and cl.deleted_at is null
left join public.equipment e on e.company_id = c.id and e.deleted_at is null
left join public.work_orders wo on wo.company_id = c.id and wo.deleted_at is null
left join public.quotes q on q.company_id = c.id and q.deleted_at is null
group by c.id;

-- ============================================================
-- RPCs seguras para operaciones importantes
-- ============================================================

create or replace function public.create_work_order(
  p_company_id uuid, p_client_id uuid, p_site_id uuid, p_title text, p_type text, p_priority text,
  p_origin text, p_created_by uuid, p_created_role text, p_description text default null, p_case_id uuid default null,
  p_main_equipment_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_code text;
begin
  if p_type not in ('Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia') then
    raise exception 'Tipo de parte no valido: %', p_type;
  end if;
  if p_origin not in ('SAT','Comercial','Gerencia','Aviso','Check','Visita','Cliente','Sistema') then
    raise exception 'Origen no valido: %', p_origin;
  end if;
  v_code := 'PAR-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into public.work_orders(company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, origin, created_by, created_role, updated_by, current_responsible_id)
  values (p_company_id, v_code, p_case_id, p_client_id, p_site_id, p_main_equipment_id, p_title, p_description, p_type, p_priority, p_origin, p_created_by, p_created_role, p_created_by, p_created_by)
  returning id into v_id;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason)
  values (p_company_id, v_id, null, 'Pendiente', p_created_by, 'Creacion de parte');
  return v_id;
end;
$$;

create or replace function public.assign_technician(
  p_work_order_id uuid, p_technician_id uuid, p_assignment_date date, p_start time, p_end time, p_role text, p_assigned_by uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_company_id uuid;
begin
  select company_id into v_company_id from public.work_orders where id = p_work_order_id and deleted_at is null;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  if p_role not in ('Principal','Apoyo') then raise exception 'Rol de asignacion no valido'; end if;
  insert into public.work_order_assignments(company_id, work_order_id, technician_id, assignment_date, planned_start_time, planned_end_time, role, assigned_by)
  values (v_company_id, p_work_order_id, p_technician_id, p_assignment_date, p_start, p_end, p_role, p_assigned_by)
  returning id into v_id;
  update public.work_orders
  set main_technician_id = case when p_role = 'Principal' then p_technician_id else main_technician_id end,
      current_responsible_id = case when p_role = 'Principal' then p_technician_id else current_responsible_id end,
      updated_by = p_assigned_by
  where id = p_work_order_id;
  insert into public.activity_log(company_id, actor_profile_id, action, entity_type, entity_id, description)
  values (v_company_id, p_assigned_by, 'asignacion', 'work_order', p_work_order_id, 'Asignacion de tecnico');
  return v_id;
end;
$$;

create or replace function public.change_work_order_status(
  p_work_order_id uuid, p_new_status text, p_changed_by uuid, p_reason text default null,
  p_manual_correction boolean default false, p_lat numeric default null, p_lng numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_previous text;
begin
  if p_new_status not in ('Pendiente','Trabajo descargado','En desplazamiento','En intervencion','Pausado','Pendiente de material','Finalizado tecnicamente','Pendiente de envio','Enviado','Devolucion solicitada','Devuelto por SAT','Cerrado','Cancelado') then
    raise exception 'Estado de parte no valido: %', p_new_status;
  end if;
  select company_id, status into v_company_id, v_previous from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  if p_new_status = v_previous then return; end if;
  update public.work_orders set status = p_new_status, updated_by = p_changed_by,
    finished_at = case when p_new_status = 'Finalizado tecnicamente' then coalesce(finished_at, now()) else finished_at end,
    sent_at = case when p_new_status = 'Enviado' then coalesce(sent_at, now()) else sent_at end
  where id = p_work_order_id;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction, location_lat, location_lng)
  values (v_company_id, p_work_order_id, v_previous, p_new_status, p_changed_by, p_reason, p_manual_correction, p_lat, p_lng);
end;
$$;

create or replace function public.request_work_order_return(p_work_order_id uuid, p_changed_by uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_previous text;
begin
  select company_id, status into v_company_id, v_previous from public.work_orders where id = p_work_order_id and deleted_at is null for update;
  if v_company_id is null then raise exception 'Parte no encontrado'; end if;
  if exists (select 1 from public.work_order_status_history where work_order_id = p_work_order_id and new_status = 'Devolucion solicitada' and is_active_return_request) then
    raise exception 'Ya existe una solicitud de devolucion activa para este parte';
  end if;
  update public.work_orders set status = 'Devolucion solicitada', updated_by = p_changed_by where id = p_work_order_id;
  insert into public.work_order_status_history(company_id, work_order_id, previous_status, new_status, changed_by, reason, is_active_return_request)
  values (v_company_id, p_work_order_id, v_previous, 'Devolucion solicitada', p_changed_by, p_reason, true);
end;
$$;

create or replace function public.finish_check(p_check_id uuid, p_finished_by uuid, p_global_result text, p_observations text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_global_result not in ('Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable') then
    raise exception 'Resultado global no valido';
  end if;
  update public.checks
  set status = 'Realizado', finished_at = now(), technician_id = coalesce(technician_id, p_finished_by), global_result = p_global_result,
      observations = coalesce(p_observations, observations)
  where id = p_check_id and deleted_at is null;
  if not found then raise exception 'Check no encontrado'; end if;
end;
$$;

create or replace function public.create_deficiency_from_check(
  p_check_id uuid, p_item_id uuid, p_severity text, p_description text, p_recommended_action text, p_responsible uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_check public.checks%rowtype;
  v_section_id uuid;
  v_code text;
begin
  if p_severity not in ('Baja','Media','Alta','Critica') then raise exception 'Gravedad no valida'; end if;
  select * into v_check from public.checks where id = p_check_id and deleted_at is null;
  if not found then raise exception 'Check no encontrado'; end if;
  select section_id into v_section_id from public.check_template_items where id = p_item_id;
  v_code := 'DEF-' || to_char(now(), 'YYYYMMDDHH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  insert into public.deficiencies(company_id, code, check_id, section_id, item_id, work_order_id, equipment_id, client_id, site_id, severity, description, recommended_action, responsible_profile_id)
  select v_check.company_id, v_code, v_check.id, v_section_id, p_item_id, v_check.work_order_id, e.id, e.client_id, e.site_id, p_severity, p_description, p_recommended_action, p_responsible
  from public.equipment e where e.id = v_check.equipment_id
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.mark_alert_as_read(p_alert_recipient_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.alert_recipients
  set is_read = true, read_at = now()
  where id = p_alert_recipient_id and (recipient_profile_id = p_profile_id or recipient_profile_id is null);
  if not found then raise exception 'Aviso no encontrado para el destinatario'; end if;
end;
$$;

-- ============================================================
-- RLS preparada para Supabase Auth
-- Politica temporal: solo usuarios autenticados con profile enlazado a auth.uid().
-- Durante desarrollo sin auth real, usar seed/migrations con rol propietario o service local.
-- ============================================================

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','profiles','profile_roles','clients','client_contacts','access_requirements','sites','site_contacts',
    'equipment_types','equipment','equipment_components','equipment_status_history','files','equipment_photos',
    'cases','case_events','case_links','case_documents','work_orders','work_order_equipment','work_order_assignments',
    'work_order_status_history','work_order_notes','work_order_photos','work_order_signatures','check_templates',
    'check_template_sections','check_template_items','checks','check_section_results','check_item_results','check_photos',
    'deficiencies','corrective_actions','alerts','alert_recipients','documents','document_links','suppliers','materials',
    'warehouses','warehouse_stock','stock_movements','material_requests','work_order_materials','opportunities','quotes','quote_lines',
    'activity_log','audit_log'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

create policy companies_authenticated_company on public.companies
  for all to authenticated
  using (id = public.current_company_id())
  with check (id = public.current_company_id());

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','clients','client_contacts','access_requirements','sites','site_contacts','equipment_types','equipment','equipment_components',
    'equipment_status_history','files','equipment_photos','cases','case_events','case_links','case_documents','work_orders','work_order_equipment',
    'work_order_assignments','work_order_status_history','work_order_notes','work_order_photos','work_order_signatures','check_templates',
    'checks','check_section_results','check_item_results','check_photos','deficiencies','corrective_actions','alerts','alert_recipients',
    'documents','document_links','suppliers','materials','warehouses','warehouse_stock','stock_movements','material_requests','work_order_materials',
    'opportunities','quotes','quote_lines','activity_log','audit_log'
  ] loop
    execute format('create policy %I on public.%I for all to authenticated using (company_id = public.current_company_id()) with check (company_id = public.current_company_id())', t || '_company_policy', t);
  end loop;
end $$;

create policy roles_authenticated_read on public.roles for select to authenticated using (true);
create policy profile_roles_authenticated_company on public.profile_roles for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.company_id = public.current_company_id()))
  with check (exists (select 1 from public.profiles p where p.id = profile_roles.profile_id and p.company_id = public.current_company_id()));
create policy check_template_sections_authenticated on public.check_template_sections for all to authenticated
  using (exists (select 1 from public.check_templates ct where ct.id = check_template_sections.template_id and (ct.company_id = public.current_company_id() or ct.company_id is null)))
  with check (exists (select 1 from public.check_templates ct where ct.id = check_template_sections.template_id and (ct.company_id = public.current_company_id() or ct.company_id is null)));
create policy check_template_items_authenticated on public.check_template_items for all to authenticated
  using (exists (select 1 from public.check_template_sections s join public.check_templates ct on ct.id = s.template_id where s.id = check_template_items.section_id and (ct.company_id = public.current_company_id() or ct.company_id is null)))
  with check (exists (select 1 from public.check_template_sections s join public.check_templates ct on ct.id = s.template_id where s.id = check_template_items.section_id and (ct.company_id = public.current_company_id() or ct.company_id is null)));

-- Permisos de ejecucion RPC para usuarios autenticados futuros.
grant execute on function public.create_work_order(uuid, uuid, uuid, text, text, text, text, uuid, text, text, uuid, uuid) to authenticated;
grant execute on function public.assign_technician(uuid, uuid, date, time, time, text, uuid) to authenticated;
grant execute on function public.change_work_order_status(uuid, text, uuid, text, boolean, numeric, numeric) to authenticated;
grant execute on function public.request_work_order_return(uuid, uuid, text) to authenticated;
grant execute on function public.finish_check(uuid, uuid, text, text) to authenticated;
grant execute on function public.create_deficiency_from_check(uuid, uuid, text, text, text, uuid) to authenticated;
grant execute on function public.mark_alert_as_read(uuid, uuid) to authenticated;
