-- DoorManager Pro - Datos semilla ficticios
-- Ejecutar despues de aplicar supabase/migrations/001_initial_dmp_schema.sql.

begin;

insert into public.companies (id, name, tax_id, email, phone)
values ('00000000-0000-0000-0000-000000000001', 'DoorManager Pro Demo SL', 'B00000000', 'demo@doormanagerpro.test', '+34 600 000 000')
on conflict (name) do nothing;

insert into public.roles (name, description) values
('SAT', 'Gestion operativa de servicio tecnico'),
('Comercial', 'Gestion comercial y oportunidades'),
('Oficina', 'Administracion y soporte documental'),
('Gerencia', 'Supervision global y metricas'),
('Tecnico', 'Ejecucion tecnica en campo')
on conflict (name) do nothing;

insert into public.profiles (id, company_id, first_name, last_name, email, phone, primary_area, hired_at) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Marta','Lopez','marta.lopez@dmp-demo.test','+34 611 000 001','SAT','2024-01-10'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Laura','Sanchez','laura.sanchez@dmp-demo.test','+34 611 000 002','Comercial','2024-02-01'),
('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Elena','Ruiz','elena.ruiz@dmp-demo.test','+34 611 000 003','Oficina','2023-11-15'),
('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Carlos','Navarro','carlos.navarro@dmp-demo.test','+34 611 000 004','Gerencia','2023-09-01'),
('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','Diego','Martin','diego.martin@dmp-demo.test','+34 611 000 005','Tecnico','2024-03-12'),
('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','Raul','Ortega','raul.ortega@dmp-demo.test','+34 611 000 006','Tecnico','2024-03-20'),
('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','Sonia','Vidal','sonia.vidal@dmp-demo.test','+34 611 000 007','Tecnico','2024-04-01'),
('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','Ivan','Mora','ivan.mora@dmp-demo.test','+34 611 000 008','Tecnico','2024-04-08'),
('10000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','Paula','Rios','paula.rios@dmp-demo.test','+34 611 000 009','Tecnico','2024-05-02'),
('10000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','Sergio','Blanco','sergio.blanco@dmp-demo.test','+34 611 000 010','Tecnico','2024-05-10')
on conflict (company_id, email) do nothing;

insert into public.profile_roles (profile_id, role_id)
select p.id, r.id from public.profiles p join public.roles r on r.name in ('SAT','Comercial') where p.email = 'marta.lopez@dmp-demo.test'
on conflict do nothing;
insert into public.profile_roles (profile_id, role_id)
select p.id, r.id from public.profiles p join public.roles r on r.name = 'Comercial' where p.email = 'laura.sanchez@dmp-demo.test'
on conflict do nothing;
insert into public.profile_roles (profile_id, role_id)
select p.id, r.id from public.profiles p join public.roles r on r.name = 'Oficina' where p.email = 'elena.ruiz@dmp-demo.test'
on conflict do nothing;
insert into public.profile_roles (profile_id, role_id)
select p.id, r.id from public.profiles p join public.roles r on r.name = 'Gerencia' where p.email = 'carlos.navarro@dmp-demo.test'
on conflict do nothing;
insert into public.profile_roles (profile_id, role_id)
select p.id, r.id from public.profiles p join public.roles r on r.name = 'Tecnico' where p.primary_area = 'Tecnico'
on conflict do nothing;

insert into public.access_requirements (id, company_id, title, description, requires_prl, requires_appointment) values
('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Acceso nave logistica','Avisar en garita, chaleco reflectante y calzado de seguridad.',true,true),
('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Acceso horario comercial','Entrada por recepcion de lunes a viernes.',false,true),
('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Acceso industrial 24h','Llamar al responsable de mantenimiento antes de entrar.',true,false)
on conflict do nothing;

insert into public.clients (id, company_id, code, legal_name, trade_name, tax_id, status, address, city, province, postal_code, phone, email, notes) values
('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','CLI-ARES','Logistica Ares SL','Ares Logistics','B12345678','Activo','Calle Transporte 12','Valencia','Valencia','46014','+34 960 000 101','mantenimiento@ares-demo.test','Cliente principal de prueba.'),
('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','CLI-NOVA','Nova Retail SA','Nova Retail','A87654321','Activo','Avenida Centro 45','Madrid','Madrid','28020','+34 910 000 102','servicios@nova-demo.test','Cadena retail.'),
('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','CLI-IBER','IberFood Distribucion SL','IberFood','B23456789','Activo','Poligono Norte 7','Zaragoza','Zaragoza','50014','+34 976 000 103','planta@iberfood-demo.test','Actividad alimentaria.'),
('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','CLI-TERRA','TerraPark Comunidades SL','TerraPark','B34567890','Activo','Calle Residencial 9','Alicante','Alicante','03005','+34 965 000 104','admin@terrapark-demo.test','Comunidades y parkings.'),
('30000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','CLI-HELIA','Helia Farma SL','Helia Farma','B45678901','Potencial','Calle Laboratorio 4','Murcia','Murcia','30007','+34 968 000 105','compras@helia-demo.test','Cliente potencial industrial.')
on conflict (company_id, code) do nothing;

insert into public.client_contacts (id, company_id, client_id, first_name, last_name, role, email, phone, is_primary) values
('31000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Javier','Prieto','Responsable mantenimiento','javier.prieto@ares-demo.test','+34 620 000 101',true),
('31000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','Ana','Campos','Facility manager','ana.campos@nova-demo.test','+34 620 000 102',true),
('31000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','Victor','Lara','Jefe planta','victor.lara@iberfood-demo.test','+34 620 000 103',true),
('31000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','Rosa','Molina','Administradora','rosa.molina@terrapark-demo.test','+34 620 000 104',true),
('31000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005','Mario','Estevez','Compras','mario.estevez@helia-demo.test','+34 620 000 105',true)
on conflict do nothing;

insert into public.sites (id, company_id, client_id, code, name, address, city, province, postal_code, latitude, longitude, schedule, access_requirement_id, primary_contact_id, active) values
('32000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','CEN-ARES-NORTE','Nave Norte','Poligono Ares, Nave 1','Valencia','Valencia','46014',39.4699000,-0.3763000,'L-V 06:00-22:00','20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001',true),
('32000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','CEN-ARES-SUR','Nave Sur','Poligono Ares, Nave 2','Valencia','Valencia','46014',39.4631000,-0.3712000,'L-S 07:00-20:00','20000000-0000-0000-0000-000000000001','31000000-0000-0000-0000-000000000001',true),
('32000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','CEN-NOVA-MAD','Tienda Madrid Norte','Avenida Centro 45','Madrid','Madrid','28020',40.4520000,-3.6920000,'L-D 09:00-22:00','20000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000002',true),
('32000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000003','CEN-IBER-ZAR','Planta Zaragoza','Poligono Norte 7','Zaragoza','Zaragoza','50014',41.6740000,-0.8890000,'24h','20000000-0000-0000-0000-000000000003','31000000-0000-0000-0000-000000000003',true),
('32000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','CEN-TERRA-P1','Parking Residencial P1','Calle Residencial 9','Alicante','Alicante','03005',38.3450000,-0.4900000,'L-D 00:00-24:00','20000000-0000-0000-0000-000000000002','31000000-0000-0000-0000-000000000004',true),
('32000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005','CEN-HELIA-MUR','Planta piloto Murcia','Calle Laboratorio 4','Murcia','Murcia','30007',37.9922000,-1.1307000,'L-V 08:00-18:00','20000000-0000-0000-0000-000000000003','31000000-0000-0000-0000-000000000005',true)
on conflict (company_id, code) do nothing;

insert into public.site_contacts (company_id, site_id, client_contact_id, is_primary)
select company_id, id, primary_contact_id, true from public.sites where primary_contact_id is not null
on conflict do nothing;

insert into public.equipment_types (id, company_id, name, description) values
('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Puerta seccional industrial','Puerta seccional para muelles y naves industriales'),
('40000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Puerta seccional domestica','Puerta seccional residencial'),
('40000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','Puerta rapida','Puerta rapida enrollable'),
('40000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','Puerta automatica peatonal','Acceso peatonal automatico'),
('40000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','Barrera','Barrera de vehiculos'),
('40000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','Cancela','Cancela corredera o batiente'),
('40000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','Muelle de carga','Muelle hidraulico de carga'),
('40000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','Abrigo de muelle','Abrigo retractil o hinchable'),
('40000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','Cuadro de maniobra','Cuadro independiente o recambio')
on conflict (company_id, name) do nothing;

insert into public.equipment (id, company_id, code, client_id, site_id, equipment_type_id, brand, model, serial_number, installation_date, internal_location, status, criticality, last_review_date, next_review_date, technical_config, notes) values
('41000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','EQ-SEC-001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Horman','SPU F42','SN-ARES-001','2020-05-15','Muelle 1','Averiado','Critica','2025-05-02','2026-05-02','{"alto_mm":4200,"ancho_mm":3500,"motor":"directo al eje"}','Equipo del flujo completo de prueba.'),
('41000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','EQ-SEC-002','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Novoferm','Iso 45','SN-ARES-002','2021-03-22','Muelle 2','Operativo','Alta','2025-04-20','2026-04-20','{"alto_mm":4000,"ancho_mm":3200}',''),
('41000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','EQ-RAP-003','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003','Angel Mir','Mirflex','SN-ARES-003','2022-01-10','Camara expediciones','Operativo','Alta','2025-03-10','2026-03-10','{"velocidad":"1.2 m/s"}',''),
('41000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','EQ-PEA-004','30000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000004','Manusa','Visio','SN-NOVA-004','2021-09-01','Entrada principal','Operativo','Alta','2025-06-01','2025-12-01','{"hojas":2}',''),
('41000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','EQ-BAR-005','30000000-0000-0000-0000-000000000004','32000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000005','BFT','Moovi','SN-TERRA-005','2019-07-12','Acceso parking','Operativo','Media','2025-02-15','2026-02-15','{}',''),
('41000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','EQ-CAN-006','30000000-0000-0000-0000-000000000004','32000000-0000-0000-0000-000000000005','40000000-0000-0000-0000-000000000006','Came','BX','SN-TERRA-006','2018-11-05','Rampa exterior','Pendiente de revision','Media','2024-12-20','2025-12-20','{}',''),
('41000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','EQ-MUE-007','30000000-0000-0000-0000-000000000003','32000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000007','Inkema','RH11','SN-IBER-007','2020-02-18','Muelle A','Operativo','Alta','2025-01-30','2026-01-30','{}',''),
('41000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','EQ-ABR-008','30000000-0000-0000-0000-000000000003','32000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000008','Inkema','ABR','SN-IBER-008','2020-02-18','Muelle A','Operativo','Media','2025-01-30','2026-01-30','{}',''),
('41000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000001','EQ-SEC-009','30000000-0000-0000-0000-000000000003','32000000-0000-0000-0000-000000000004','40000000-0000-0000-0000-000000000001','Horman','SPU F42','SN-IBER-009','2022-06-08','Muelle B','Operativo','Alta','2025-06-08','2026-06-08','{}',''),
('41000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','EQ-CUA-010','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000009','Erreka','VIVO','SN-ARES-010','2023-01-12','Cuadro muelle 1','Operativo','Alta','2025-05-02','2026-05-02','{}',''),
('41000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','EQ-RAP-011','30000000-0000-0000-0000-000000000005','32000000-0000-0000-0000-000000000006','40000000-0000-0000-0000-000000000003','BMP','Pack','SN-HELIA-011','2024-01-15','Sala limpia','Operativo','Critica','2025-01-15','2026-01-15','{"uso":"propuesta demo"}','Equipo demo vinculado a cliente potencial.'),
('41000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','EQ-SEC-012','30000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000002','Horman','LPU','SN-NOVA-012','2020-10-10','Almacen tienda','Operativo','Media','2025-04-04','2026-04-04','{}','')
on conflict (company_id, code) do nothing;

insert into public.equipment_components (company_id, equipment_id, component_type, brand, model, serial_number, status, technical_config)
select '00000000-0000-0000-0000-000000000001', id, component_type, brand, model, serial_number, 'Operativo', '{}'::jsonb
from (values
('41000000-0000-0000-0000-000000000001'::uuid,'Motor','MFZ','STAW','M-ARES-001'),
('41000000-0000-0000-0000-000000000001'::uuid,'Cuadro','Erreka','VIVO','C-ARES-001'),
('41000000-0000-0000-0000-000000000001'::uuid,'Fotocelulas','Nice','FT210','F-ARES-001'),
('41000000-0000-0000-0000-000000000001'::uuid,'Banda de seguridad','Bircher','ProLoop','B-ARES-001')
) as v(id, component_type, brand, model, serial_number)
on conflict do nothing;

insert into public.files (id, company_id, bucket, path, name, mime_type, size_bytes, uploaded_by, description) values
('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','dmp-demo','equipment/eq-sec-001/frontal.jpg','frontal.jpg','image/jpeg',245000,'10000000-0000-0000-0000-000000000005','Fotografia frontal ficticia'),
('50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','dmp-demo','checks/chk-001/cable.jpg','cable.jpg','image/jpeg',180000,'10000000-0000-0000-0000-000000000005','Cable deshilachado ficticio'),
('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','dmp-demo','documents/manual-seccional.pdf','manual-seccional.pdf','application/pdf',1024000,'10000000-0000-0000-0000-000000000003','Manual ficticio')
on conflict (bucket, path) do nothing;

insert into public.cases (id, company_id, code, title, description, type, priority, status, client_id, site_id, responsible_profile_id, origin, created_by) values
('60000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','EXP-ARES-AV-001','Averia puerta muelle 1','La puerta seccional no cierra correctamente y bloquea expediciones.','Averia','Critica','En curso','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','SAT','10000000-0000-0000-0000-000000000001'),
('60000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','EXP-NOVA-MAN-001','Mantenimiento acceso peatonal','Revision preventiva semestral.','Mantenimiento','Normal','Abierto','30000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Cliente','10000000-0000-0000-0000-000000000002'),
('60000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','EXP-IBER-INS-001','Inspeccion muelles planta','Inspeccion anual de muelles y abrigos.','Inspeccion','Alta','Abierto','30000000-0000-0000-0000-000000000003','32000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','SAT','10000000-0000-0000-0000-000000000001')
on conflict (company_id, code) do nothing;

insert into public.work_orders (id, company_id, code, case_id, client_id, site_id, main_equipment_id, title, description, type, priority, status, origin, scheduled_date, scheduled_time, estimated_duration_minutes, main_technician_id, technical_team, contact_id, access_requirement_id, planned_material, diagnosis, work_performed, result, finished_at, sent_at, created_by, created_role, updated_by, current_responsible_id) values
('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','PAR-ARES-001','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Averia urgente EQ-SEC-001','No cierra en automatico y emite ruido en cableado.','Averia urgente','Critica','En intervencion','SAT',current_date,'08:30',120,'10000000-0000-0000-0000-000000000005','Diego Martin + Raul Ortega','31000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Cable, terminales y grasa','Cable con hilos rotos y ajuste deficiente.','Intervencion en curso.','Pendiente de valoracion final',null,null,'10000000-0000-0000-0000-000000000001','SAT','10000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000005'),
('70000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','PAR-NOVA-001','60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','32000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000004','Preventivo puerta peatonal','Revision semestral de seguridad.','Preventivo','Normal','Pendiente','Cliente',current_date + 1,'10:00',90,'10000000-0000-0000-0000-000000000006','Raul Ortega','31000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',null,null,null,null,null,null,'10000000-0000-0000-0000-000000000002','Comercial','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000006'),
('70000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','PAR-IBER-001','60000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000003','32000000-0000-0000-0000-000000000004','41000000-0000-0000-0000-000000000007','Inspeccion muelle A','Revision de muelle y abrigo.','Inspeccion','Alta','Finalizado tecnicamente','SAT',current_date - 1,'09:00',150,'10000000-0000-0000-0000-000000000007','Sonia Vidal','31000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000003',null,'Sin incidencias criticas.','Revision realizada.','Favorable con observaciones',now() - interval '1 day',null,'10000000-0000-0000-0000-000000000001','SAT','10000000-0000-0000-0000-000000000007','10000000-0000-0000-0000-000000000003'),
('70000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','PAR-TERRA-001',null,'30000000-0000-0000-0000-000000000004','32000000-0000-0000-0000-000000000005','41000000-0000-0000-0000-000000000005','Barrera no sube','Aviso de comunidad por fallo intermitente.','Correctivo','Alta','Pendiente de material','Aviso',current_date + 2,'16:00',90,'10000000-0000-0000-0000-000000000008','Ivan Mora','31000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000002','Condensador motor',null,null,null,null,null,'10000000-0000-0000-0000-000000000003','Oficina','10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001')
on conflict (company_id, code) do nothing;

insert into public.work_order_equipment (company_id, work_order_id, equipment_id, is_primary) values
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001',true),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000010',false),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000004',true),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000007',true)
on conflict do nothing;

insert into public.work_order_assignments (company_id, work_order_id, technician_id, assignment_date, planned_start_time, planned_end_time, role, status, assigned_by) values
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005',current_date,'08:30','10:30','Principal','En curso','10000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006',current_date,'08:30','10:30','Apoyo','En curso','10000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000006',current_date + 1,'10:00','11:30','Principal','Asignado','10000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000007',current_date - 1,'09:00','11:30','Principal','Finalizado','10000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000008',current_date + 2,'16:00','17:30','Principal','Asignado','10000000-0000-0000-0000-000000000003')
on conflict (work_order_id, technician_id, assignment_date) do nothing;

insert into public.work_order_status_history (company_id, work_order_id, previous_status, new_status, changed_by, reason, manual_correction) values
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001',null,'Pendiente','10000000-0000-0000-0000-000000000001','Creacion desde SAT',false),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Pendiente','Trabajo descargado','10000000-0000-0000-0000-000000000005','Descarga en movil',false),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Trabajo descargado','En desplazamiento','10000000-0000-0000-0000-000000000005','Salida hacia cliente',false),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','En desplazamiento','En intervencion','10000000-0000-0000-0000-000000000005','Inicio de intervencion',false),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000003','En intervencion','Finalizado tecnicamente','10000000-0000-0000-0000-000000000007','Trabajo finalizado',false)
on conflict do nothing;

insert into public.check_templates (id, company_id, equipment_type_id, name, version) values
('80000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Puerta seccional industrial','1.0')
on conflict (company_id, name, version) do nothing;

insert into public.check_template_sections (id, template_id, title, position) values
('81000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','Hoja',1),
('81000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000001','Guias',2),
('81000000-0000-0000-0000-000000000003','80000000-0000-0000-0000-000000000001','Linea de muelles y compensacion',3),
('81000000-0000-0000-0000-000000000004','80000000-0000-0000-0000-000000000001','Automatizacion, maniobra y seguridad',4),
('81000000-0000-0000-0000-000000000005','80000000-0000-0000-0000-000000000001','Estructura',5),
('81000000-0000-0000-0000-000000000006','80000000-0000-0000-0000-000000000001','Funcionamiento general',6)
on conflict (template_id, position) do nothing;

insert into public.check_template_items (section_id, title, component, position) values
('81000000-0000-0000-0000-000000000001','Paneles','HOJA',1),('81000000-0000-0000-0000-000000000001','Herrajes','HOJA',2),('81000000-0000-0000-0000-000000000001','Bisagras','HOJA',3),('81000000-0000-0000-0000-000000000001','Rodillos','HOJA',4),('81000000-0000-0000-0000-000000000001','Juntas','HOJA',5),('81000000-0000-0000-0000-000000000001','Perfil inferior','HOJA',6),('81000000-0000-0000-0000-000000000001','Sistema anticaida','HOJA',7),
('81000000-0000-0000-0000-000000000002','Guias','GUIAS',1),
('81000000-0000-0000-0000-000000000003','Muelles','LINEA DE MUELLES Y COMPENSACION',1),('81000000-0000-0000-0000-000000000003','Eje','LINEA DE MUELLES Y COMPENSACION',2),('81000000-0000-0000-0000-000000000003','Tambores','LINEA DE MUELLES Y COMPENSACION',3),('81000000-0000-0000-0000-000000000003','Cables','LINEA DE MUELLES Y COMPENSACION',4),('81000000-0000-0000-0000-000000000003','Soportes','LINEA DE MUELLES Y COMPENSACION',5),('81000000-0000-0000-0000-000000000003','Cojinetes','LINEA DE MUELLES Y COMPENSACION',6),('81000000-0000-0000-0000-000000000003','Seguridad de rotura o paracaidas de cable','LINEA DE MUELLES Y COMPENSACION',7),
('81000000-0000-0000-0000-000000000004','Motor directo al eje','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',1),('81000000-0000-0000-0000-000000000004','Desbloqueo manual','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',2),('81000000-0000-0000-0000-000000000004','Cuadro de maniobra','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',3),('81000000-0000-0000-0000-000000000004','Cableado','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',4),('81000000-0000-0000-0000-000000000004','Alimentacion y protecciones','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',5),('81000000-0000-0000-0000-000000000004','Finales de carrera o encoder','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',6),('81000000-0000-0000-0000-000000000004','Fotocelulas','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',7),('81000000-0000-0000-0000-000000000004','Banda de seguridad','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',8),('81000000-0000-0000-0000-000000000004','Activacion','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',9),('81000000-0000-0000-0000-000000000004','Senalizacion','AUTOMATIZACION, MANIOBRA Y SEGURIDAD',10),
('81000000-0000-0000-0000-000000000005','Estructura','ESTRUCTURA',1),
('81000000-0000-0000-0000-000000000006','Apertura y cierre','FUNCIONAMIENTO GENERAL',1),('81000000-0000-0000-0000-000000000006','Equilibrado','FUNCIONAMIENTO GENERAL',2),('81000000-0000-0000-0000-000000000006','Suavidad de marcha','FUNCIONAMIENTO GENERAL',3),('81000000-0000-0000-0000-000000000006','Ruidos o rozamientos','FUNCIONAMIENTO GENERAL',4),('81000000-0000-0000-0000-000000000006','Maniobra manual','FUNCIONAMIENTO GENERAL',5)
on conflict (section_id, position) do nothing;

insert into public.checks (id, company_id, code, work_order_id, equipment_id, template_id, technician_id, started_at, finished_at, status, global_result, observations) values
('82000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','CHK-ARES-001','70000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005',now() - interval '1 hour',null,'En curso','Problema leve','Check asociado al flujo completo.'),
('82000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','CHK-IBER-001','70000000-0000-0000-0000-000000000003','41000000-0000-0000-0000-000000000009','80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000007',now() - interval '1 day',now() - interval '23 hours','Realizado','Todo favorable','Sin defectos relevantes.'),
('82000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','CHK-NOVA-001','70000000-0000-0000-0000-000000000002','41000000-0000-0000-0000-000000000012','80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006',null,null,'Por realizar','Sin revisar','Pendiente de ejecucion.')
on conflict (company_id, code) do nothing;

insert into public.check_section_results (company_id, check_id, section_id, result, observations) values
('00000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003','Problema leve','Cable con desgaste visible'),
('00000000-0000-0000-0000-000000000001','82000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000006','Todo favorable','Funcionamiento correcto')
on conflict (check_id, section_id) do nothing;

insert into public.check_item_results (company_id, check_id, section_result_id, item_id, result, observations)
select '00000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', csr.id, cti.id, 'Problema leve', 'Cable con hilos rotos en zona de tambor'
from public.check_section_results csr
join public.check_template_items cti on cti.section_id = csr.section_id and cti.title = 'Cables'
where csr.check_id = '82000000-0000-0000-0000-000000000001'
on conflict (check_id, item_id) do nothing;

insert into public.check_photos (company_id, check_id, item_result_id, file_id, taken_by, description)
select '00000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', cir.id, '50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000005', 'Foto de cable con desgaste'
from public.check_item_results cir
join public.check_template_items cti on cti.id = cir.item_id
where cir.check_id = '82000000-0000-0000-0000-000000000001' and cti.title = 'Cables'
on conflict do nothing;

insert into public.deficiencies (id, company_id, code, check_id, section_id, work_order_id, equipment_id, client_id, site_id, severity, description, photo_file_id, recommended_action, status, responsible_profile_id, due_date) values
('83000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','DEF-ARES-001','82000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','Alta','Cable con hilos rotos y riesgo de fallo de compensacion.','50000000-0000-0000-0000-000000000002','Sustituir cable y revisar tambores.','Pendiente de valoracion','10000000-0000-0000-0000-000000000001',current_date + 7)
on conflict (company_id, code) do nothing;

update public.deficiencies d
set item_id = cti.id
from public.check_template_items cti
where d.id = '83000000-0000-0000-0000-000000000001'
  and cti.section_id = '81000000-0000-0000-0000-000000000003'
  and cti.title = 'Cables';

insert into public.alerts (id, company_id, code, title, description, type, priority, status, related_entity, related_id, created_by) values
('90000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','AVI-ARES-001','Deficiencia alta en EQ-SEC-001','Revisar valoracion de cable y posible presupuesto.','Tecnico','Alta','Abierto','deficiencies','83000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005'),
('90000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','AVI-MAT-001','Material pendiente para PAR-TERRA-001','Preparar condensador de motor para barrera.','Material','Normal','Abierto','work_orders','70000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003')
on conflict (company_id, code) do nothing;

insert into public.alert_recipients (company_id, alert_id, recipient_profile_id, recipient_role) values
('00000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','SAT'),
('00000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000003','Oficina')
on conflict do nothing;

insert into public.documents (id, company_id, title, type, version, document_date, valid, origin, file_id, available_offline, observations) values
('91000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Manual ficticio puerta seccional industrial','Manual de mantenimiento','1.0','2024-01-01',true,'Fabricante','50000000-0000-0000-0000-000000000003',true,'Documento ficticio para pruebas offline.')
on conflict do nothing;

insert into public.document_links (company_id, document_id, related_type, related_id, related_value) values
('00000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Equipo','41000000-0000-0000-0000-000000000001',null),
('00000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Tipo de equipo','40000000-0000-0000-0000-000000000001',null),
('00000000-0000-0000-0000-000000000001','91000000-0000-0000-0000-000000000001','Marca',null,'Horman')
on conflict do nothing;

insert into public.suppliers (id, company_id, name, tax_id, email, phone) values
('92000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Recambios Industriales Demo SL','B90000001','ventas@recambios-demo.test','+34 900 000 001')
on conflict do nothing;

insert into public.materials (id, company_id, code, description, manufacturer, reference, unit, cost, price, minimum_stock) values
('93000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','MAT-CAB-001','Cable acero 5 mm para seccional','DemoSteel','CAB-5MM','m',3.20,7.50,30),
('93000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','MAT-FOT-001','Juego fotocelulas exterior','SafeDoor','FT-EXT','ud',28.00,65.00,4),
('93000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','MAT-CON-001','Condensador motor barrera','ElectroDemo','COND-16','ud',6.00,18.00,8)
on conflict (company_id, code) do nothing;

insert into public.warehouses (id, company_id, code, name, address) values
('94000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','ALM-CENTRAL','Almacen central','Calle Taller 1')
on conflict (company_id, code) do nothing;

insert into public.warehouse_stock (company_id, warehouse_id, material_id, quantity, reserved_quantity) values
('00000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001',120,20),
('00000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002',6,0),
('00000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000003',3,1)
on conflict (warehouse_id, material_id) do nothing;

insert into public.work_order_materials (company_id, work_order_id, material_id, planned_quantity, used_quantity, unit_price, notes) values
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001',12,0,7.50,'Previsto para sustitucion de cable'),
('00000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000004','93000000-0000-0000-0000-000000000003',1,0,18.00,'Material pendiente')
on conflict do nothing;

insert into public.opportunities (id, company_id, code, origin, title, description, client_id, site_id, equipment_id, case_id, responsible_profile_id, status, estimated_amount, source_related_type, source_related_id) values
('95000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','OPO-ARES-001','Deficiencia','Sustitucion cable EQ-SEC-001','Oportunidad generada por deficiencia de check.','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','Presupuestada',480.00,'deficiencies','83000000-0000-0000-0000-000000000001'),
('95000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','OPO-HELIA-001','Cliente','Contrato mantenimiento planta Helia','Propuesta comercial inicial para cliente potencial.','30000000-0000-0000-0000-000000000005','32000000-0000-0000-0000-000000000006','41000000-0000-0000-0000-000000000011',null,'10000000-0000-0000-0000-000000000002','Nueva',1800.00,'client','30000000-0000-0000-0000-000000000005')
on conflict (company_id, code) do nothing;

insert into public.quotes (id, company_id, code, opportunity_id, client_id, site_id, case_id, title, status, issue_date, valid_until, subtotal, tax_amount, total, created_by) values
('96000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','PRE-ARES-001','95000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','32000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Sustitucion cable seccional EQ-SEC-001','Enviado',current_date,current_date + 30,410.00,86.10,496.10,'10000000-0000-0000-0000-000000000002')
on conflict (company_id, code) do nothing;

insert into public.quote_lines (company_id, quote_id, position, material_id, description, quantity, unit_price, total) values
('00000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001',1,'93000000-0000-0000-0000-000000000001','Cable acero 5 mm y terminales',12,7.50,90.00),
('00000000-0000-0000-0000-000000000001','96000000-0000-0000-0000-000000000001',2,null,'Mano de obra tecnica y ajuste de compensacion',2,160.00,320.00)
on conflict (quote_id, position) do nothing;

update public.deficiencies
set origin_alert_id = '90000000-0000-0000-0000-000000000001', origin_opportunity_id = '95000000-0000-0000-0000-000000000001', origin_quote_id = '96000000-0000-0000-0000-000000000001'
where id = '83000000-0000-0000-0000-000000000001';

insert into public.case_links (company_id, case_id, related_type, related_id) values
('00000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Equipo','41000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Parte','70000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Check','82000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Aviso','90000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Oportunidad','95000000-0000-0000-0000-000000000001'),
('00000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Presupuesto','96000000-0000-0000-0000-000000000001')
on conflict do nothing;

insert into public.activity_log (company_id, actor_profile_id, action, entity_type, entity_id, description) values
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','creacion','case','60000000-0000-0000-0000-000000000001','Creacion de expediente de averia'),
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','asignacion','work_order','70000000-0000-0000-0000-000000000001','Parte asignado a Diego Martin'),
('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','cambio de estado','check','82000000-0000-0000-0000-000000000001','Check en curso con deficiencia detectada')
on conflict do nothing;

commit;
