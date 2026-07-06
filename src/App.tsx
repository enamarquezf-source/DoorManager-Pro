import { createContext, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bell, BriefcaseBusiness, Building2, CalendarClock, CheckCircle2, ChevronLeft, ClipboardCheck, ClipboardList, Eye, EyeOff, Factory, FileText, Gauge, Home, LogOut, Menu, PackageCheck, PanelLeftClose, PanelLeftOpen, PieChart, Search, Settings, ShieldAlert, Truck, UserRound, UsersRound, Warehouse, Wrench, X } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { authService } from './services/authService';
import { profilesService } from './services/profilesService';
import { clientsService } from './services/clientsService';
import { sitesService } from './services/sitesService';
import { equipmentService } from './services/equipmentService';
import { casesService } from './services/casesService';
import { workOrdersService } from './services/workOrdersService';
import { assignmentsService } from './services/assignmentsService';
import { checksService } from './services/checksService';
import { deficienciesService } from './services/deficienciesService';
import { alertsService } from './services/alertsService';
import { documentsService } from './services/documentsService';
import { managementService } from './services/managementService';
import { dashboardService } from './services/dashboardService';
import { checkProblemStatuses, checkStatuses, physicalTemplateZones, sectionalZones, templateForEquipment, visibleTemplateZones, type CheckBlockId } from './checks/sectionalZones';
import { technicianOfflineService } from './services/technicianOfflineService';
import { canAccessModule, canAssignTechnician, canCreateAlert, canCreateCheck, canCreateWorkOrder, canEditWorkOrder, canExecuteWorkOrder, canViewWorkOrder } from './auth/permissions';
import { displayStatus, formatDate, fullName, initials, nextWorkOrderStatus, previousWorkOrderStatus, roleToWorkspace, severityForPriority, severityForStatus, visibleLabel, workspaceTitles, workspaceToRole } from './shared/labels';
import type { Profile, RoleName, Severity, Workspace } from './shared/types';

type AuthContextValue = { session: Session | null; profile: Profile | null; workspace: Workspace; setWorkspace: (workspace: Workspace) => void; refreshProfile: () => Promise<void>; signOut: () => Promise<void> };
type LoadState<T> = { data: T; loading: boolean; error: string };

const AuthContext = createContext<AuthContextValue | null>(null);
const sidebarKey = 'dmp-sidebar-collapsed';
const workspaceKey = 'dmp-workspace';
const iconProps = { size: 18, strokeWidth: 2 };

function App() {
  return <BrowserRouter><AuthProvider><Routes><Route path="/" element={<LoginPage />} /><Route element={<ProtectedLayout />}><Route path="/app/inicio" element={<HomePage />} /><Route path="/app/clientes" element={<ClientsPage />} /><Route path="/app/clientes/:id" element={<ClientDetailPage />} /><Route path="/app/centros" element={<SitesPage />} /><Route path="/app/centros/:id" element={<SiteDetailPage />} /><Route path="/app/equipos" element={<EquipmentPage />} /><Route path="/app/equipos/:id" element={<EquipmentDetailPage />} /><Route path="/app/expedientes" element={<CasesPage />} /><Route path="/app/expedientes/:id" element={<CaseDetailPage />} /><Route path="/app/partes" element={<WorkOrdersPage />} /><Route path="/app/trabajos" element={<Navigate to="/app/partes" replace />} /><Route path="/app/trabajos/:id" element={<WorkOrderDetailPage />} /><Route path="/app/partes/:id" element={<WorkOrderDetailPage />} /><Route path="/app/tecnico" element={<TechnicianDayPage />} /><Route path="/app/tecnico/trabajo/:id" element={<TechnicianWorkPage />} /><Route path="/app/pendientes" element={<PendingSyncPage />} /><Route path="/app/checks" element={<ChecksPage />} /><Route path="/app/checks/:id" element={<CheckDetailPage />} /><Route path="/app/checks/:id/bloque/:blockId" element={<CheckBlockPage />} /><Route path="/app/deficiencias" element={<DeficienciesPage />} /><Route path="/app/deficiencias/:id" element={<DeficiencyDetailPage />} /><Route path="/app/avisos" element={<AlertsPage />} /><Route path="/app/documentos" element={<DocumentsPage />} /><Route path="/app/documentos/:id" element={<DocumentDetailPage />} /><Route path="/app/gerencia" element={<ManagementPage />} /><Route path="/app/modulos/:moduleId" element={<ModulePage />} /><Route path="/app/*" element={<NotFound />} /></Route><Route path="*" element={<NotFound />} /></Routes></AuthProvider></BrowserRouter>;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workspace, setWorkspaceState] = useState<Workspace>(() => (localStorage.getItem(workspaceKey) as Workspace | null) ?? 'sat');

  const refreshProfile = async () => {
    const current = (await authService.getSession()).data.session;
    setSession(current);
    if (!current) { setProfile(null); return; }
    const nextProfile = await profilesService.getCurrentProfile();
    setProfile(nextProfile);
    const saved = localStorage.getItem(workspaceKey) as Workspace | null;
    const firstWorkspace = roleToWorkspace[nextProfile.roles[0] ?? nextProfile.primary_area];
    const allowed = saved && nextProfile.roles.some((role) => roleToWorkspace[role] === saved) ? saved : firstWorkspace;
    setWorkspaceState(allowed);
  };

  useEffect(() => {
    refreshProfile().catch(() => setProfile(null));
    const { data } = authService.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession) refreshProfile().catch(() => setProfile(null));
      else setProfile(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const setWorkspace = (next: Workspace) => { localStorage.setItem(workspaceKey, next); setWorkspaceState(next); };
  const signOut = async () => { await authService.signOut(); localStorage.removeItem(workspaceKey); setSession(null); setProfile(null); };
  const value = useMemo(() => ({ session, profile, workspace, setWorkspace, refreshProfile, signOut }), [session, profile, workspace]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthContext no disponible'); return value; }

function LoginPage() {
  const { session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (session && profile) navigate(profile.primary_area === 'Tecnico' ? '/app/tecnico' : '/app/inicio', { replace: true }); }, [session, profile, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setError('');
    const { error: signError } = await authService.signIn(email, password);
    if (signError) { setError('No se ha podido iniciar sesión. Comprueba que el usuario existe en Supabase Auth y que profiles.auth_user_id está enlazado.'); setLoading(false); return; }
    try { await refreshProfile(); } catch (err) { setError(err instanceof Error ? err.message : 'Perfil no enlazado.'); await authService.signOut(); }
    setLoading(false);
  };

  return <main className="login-page"><section className="login-visual" aria-hidden="true"><div className="industrial-mark"><Factory size={42} /><span>DMP</span></div><div className="door-illustration"><span /><span /><span /><i /></div><h1>DoorManager Pro</h1><p>Operaciones, mantenimiento, SAT y gestión empresarial sobre un mismo núcleo de información.</p><div className="visual-tags"><Badge tone="maintenance">SAT</Badge><Badge tone="commercial">Comercial</Badge><Badge tone="info">Dirección</Badge></div></section><form className="login-card" aria-label="Acceso a DoorManager Pro" onSubmit={submit}><div className="login-brand"><Factory size={30} /><div><strong>DoorManager Pro</strong><span>Acceso privado conectado a Supabase</span></div></div><label>Correo<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" autoComplete="username" required /></label><label>Contraseña<div className="password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Contraseña" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p className="form-error"><AlertTriangle size={16} />{error}</p>}<button className="primary wide big" disabled={loading}>{loading ? 'Iniciando sesión...' : 'Iniciar sesión'}</button><footer>Las credenciales no se publican en la interfaz ni en el repositorio.</footer></form></main>;
}

function ProtectedLayout() {
  const { session, profile, workspace, setWorkspace, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 760 || localStorage.getItem(sidebarKey) === 'true');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const nav = navForWorkspace(workspace).filter((item) => canAccessModule(profile, workspace, item.id));
  const active = nav.find((item) => location.pathname.startsWith(item.path)) ?? nav[0];

  useEffect(() => { setAlertsOpen(false); setUserOpen(false); if (window.innerWidth <= 760) setCollapsed(true); }, [location.pathname, workspace]);
  useEffect(() => {
    const loadUnread = () => { if (profile) alertsService.unread().then((rows) => setUnread(rows.length)).catch(() => setUnread(0)); };
    loadUnread();
    window.addEventListener('dmp-alerts-changed', loadUnread);
    return () => window.removeEventListener('dmp-alerts-changed', loadUnread);
  }, [profile, location.pathname]);

  if (!session) return <Navigate to="/" replace />;
  if (!profile) return <main className="page"><Card title="Perfil no enlazado"><p className="form-error">La sesión existe, pero no hay perfil activo enlazado a este usuario Auth.</p><button className="primary" onClick={() => signOut()}>Cerrar sesión</button></Card></main>;
  const allowedWorkspaces = profile.roles.map((role) => roleToWorkspace[role]);
  if (!allowedWorkspaces.includes(workspace)) setWorkspace(allowedWorkspaces[0]);

  const toggleSidebar = () => { localStorage.setItem(sidebarKey, String(!collapsed)); setCollapsed(!collapsed); };
  const doSignOut = async () => { const pending = await technicianOfflineService.pending(); if (pending.length && !window.confirm(`Hay ${pending.length} cambios técnicos pendientes de sincronizar. Si sales, seguirán guardados en este dispositivo. Acepta para salir o cancela para revisar pendientes.`)) { navigate('/app/pendientes'); return; } setAlertsOpen(false); await signOut(); navigate('/', { replace: true }); };

  return <div className="shell"><aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}><div className="brand-row"><Link className="brand" to={workspace === 'tecnico' ? '/app/tecnico' : '/app/inicio'}><Factory {...iconProps} /><span>DoorManager</span></Link><button className="side-toggle" onClick={toggleSidebar} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>{collapsed ? <PanelLeftOpen {...iconProps} /> : <PanelLeftClose {...iconProps} />}</button></div><nav>{nav.map((item) => { const Icon = item.icon; return <Link key={item.id} className={active?.id === item.id ? 'active' : ''} to={item.path}><Icon {...iconProps} /><span>{item.label}</span></Link>; })}</nav></aside><div className="workspace"><header className="topbar"><button className="mobile-menu" onClick={toggleSidebar} title="Menú"><Menu {...iconProps} /></button><div className="top-title"><p className="eyebrow">{workspaceTitles[workspace]}</p><h1>{active?.label ?? 'DoorManager Pro'}</h1></div><GlobalSearch query={query} setQuery={setQuery} /><button className="icon-btn" onClick={() => setAlertsOpen(true)} title="Centro de avisos" aria-label="Abrir centro de avisos"><Bell {...iconProps} /><b>{unread}</b></button><div className="user-menu-wrap"><button className="user user-button" onClick={() => setUserOpen(!userOpen)}><span>{initials(fullName(profile))}</span><div><strong>{fullName(profile)}</strong><small>{profile.primary_area}</small></div></button>{userOpen && <><button className="popover-backdrop" aria-label="Cerrar menú" onClick={() => setUserOpen(false)} /><div className="user-popover" role="menu"><button disabled><UserRound size={16} /> Mi perfil</button>{allowedWorkspaces.length > 1 && <div className="workspace-switch"><strong>Cambiar espacio de trabajo</strong>{allowedWorkspaces.map((item) => <button key={item} className={workspace === item ? 'active' : ''} onClick={() => { setWorkspace(item); navigate(item === 'tecnico' ? '/app/tecnico' : '/app/inicio'); }}>{workspaceTitles[item]}</button>)}</div>}<button disabled><Settings size={16} /> Preferencias locales</button><button onClick={doSignOut}><LogOut size={16} /> Cerrar sesión</button></div></>}</div><div className="mobile-session-actions"><button onClick={doSignOut}><LogOut size={16} /> Salir</button></div></header><main><Outlet /></main></div>{alertsOpen && <SidePanel title="Centro de avisos" subtitle={workspaceTitles[workspace]} onClose={() => setAlertsOpen(false)}><AlertsPanel onClose={() => setAlertsOpen(false)} /></SidePanel>}</div>;
}

function navForWorkspace(workspace: Workspace) {
  const sat = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'planificacion', label: 'Planificación', path: '/app/modulos/planificacion', icon: CalendarClock }, { id: 'trabajos', label: 'Trabajos', path: '/app/partes', icon: ClipboardList }, { id: 'tecnicos', label: 'Técnicos', path: '/app/modulos/tecnicos', icon: UsersRound }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'centros', label: 'Centros', path: '/app/centros', icon: Factory }, { id: 'equipos', label: 'Equipos', path: '/app/equipos', icon: Warehouse }, { id: 'expedientes', label: 'Expedientes', path: '/app/expedientes', icon: FileText }, { id: 'partes', label: 'Partes', path: '/app/partes', icon: ClipboardList }, { id: 'checks', label: 'Checks', path: '/app/checks', icon: ClipboardCheck }, { id: 'deficiencias', label: 'Deficiencias', path: '/app/deficiencias', icon: ShieldAlert }, { id: 'documentos', label: 'Documentación', path: '/app/documentos', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  const comercial = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'oportunidades', label: 'Oportunidades', path: '/app/modulos/oportunidades', icon: BriefcaseBusiness }, { id: 'presupuestos', label: 'Presupuestos', path: '/app/modulos/presupuestos', icon: FileText }, { id: 'contratos', label: 'Contratos', path: '/app/modulos/contratos', icon: ClipboardList }, { id: 'visitas', label: 'Visitas', path: '/app/modulos/visitas', icon: CalendarClock }, { id: 'expedientes', label: 'Expedientes', path: '/app/expedientes', icon: FileText }, { id: 'partes', label: 'Partes', path: '/app/partes', icon: ClipboardList }, { id: 'informes', label: 'Informes comerciales', path: '/app/modulos/informes-comerciales', icon: PieChart }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  const oficina = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'administracion', label: 'Administración', path: '/app/modulos/administracion', icon: ClipboardCheck }, { id: 'facturacion', label: 'Facturación', path: '/app/modulos/facturacion', icon: FileText }, { id: 'cobros', label: 'Cobros', path: '/app/modulos/cobros', icon: Bell }, { id: 'compras', label: 'Compras', path: '/app/modulos/compras', icon: Truck }, { id: 'proveedores', label: 'Proveedores', path: '/app/modulos/proveedores', icon: Warehouse }, { id: 'prl', label: 'PRL y personal', path: '/app/modulos/prl', icon: ShieldAlert }, { id: 'vehiculos', label: 'Vehículos', path: '/app/modulos/vehiculos', icon: Truck }, { id: 'documentos', label: 'Documentos', path: '/app/documentos', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  const gerencia = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'resumen', label: 'Resumen', path: '/app/gerencia', icon: PieChart }, { id: 'ventas', label: 'Ventas', path: '/app/modulos/ventas', icon: BriefcaseBusiness }, { id: 'operaciones', label: 'Operaciones', path: '/app/modulos/operaciones', icon: Gauge }, { id: 'rentabilidad', label: 'Rentabilidad', path: '/app/modulos/rentabilidad', icon: PieChart }, { id: 'calidad', label: 'Calidad', path: '/app/deficiencias', icon: ShieldAlert }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'personal', label: 'Personal', path: '/app/modulos/personal', icon: UsersRound }, { id: 'informes', label: 'Informes', path: '/app/modulos/informes', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  if (workspace === 'tecnico') return [{ id: 'jornada', label: 'Mi jornada', path: '/app/tecnico', icon: CalendarClock }, { id: 'checks', label: 'Checks', path: '/app/checks', icon: ClipboardCheck }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  if (workspace === 'sat') return sat;
  if (workspace === 'comercial') return comercial;
  if (workspace === 'oficina') return oficina;
  return gerencia;
}

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = [], empty: T) {
  const [state, setState] = useState<LoadState<T>>({ data: empty, loading: true, error: '' });
  const reload = async () => { setState((prev) => ({ ...prev, loading: true, error: '' })); try { setState({ data: await loader(), loading: false, error: '' }); } catch (err) { setState({ data: empty, loading: false, error: err instanceof Error ? err.message : 'Error inesperado' }); } };
  useEffect(() => { reload(); }, deps);
  return { ...state, reload };
}

function HomePage() {
  const { workspace } = useAuth();
  if (workspace === 'sat') return <SatDashboard />;
  if (workspace === 'comercial') return <CommercialDashboard />;
  if (workspace === 'oficina') return <OfficeDashboard />;
  if (workspace === 'gerencia') return <ManagementDashboard />;
  return <Navigate to="/app/tecnico" replace />;
}

function SatDashboard() {
  const { data, loading, error, reload } = useLoad(() => dashboardService.getSatDashboardData(), [], null as any);
  const [mode, setMode] = useState<'work' | 'alert' | 'check' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const todayWorks = data.workOrders.filter((w: any) => w.scheduled_date === data.day);
  const pending = data.workOrders.filter((w: any) => ['Pendiente', 'Trabajo descargado'].includes(w.status));
  const inProgress = data.workOrders.filter((w: any) => ['En desplazamiento', 'En intervencion', 'Finalizado tecnicamente', 'Pendiente de envio'].includes(w.status));
  const unassigned = data.workOrders.filter((w: any) => !w.main_technician_name);
  const urgent = data.workOrders.filter((w: any) => ['Alta', 'Critica'].includes(w.priority));
  const delayed = data.workOrders.filter((w: any) => w.scheduled_date === data.prevDay && !['Enviado', 'Cerrado', 'Cancelado'].includes(w.status));
  const openDef = data.deficiencies.filter((d: any) => !['Corregida', 'Cerrada', 'Rechazada'].includes(d.status));
  const criticalAlerts = data.alerts.filter((a: any) => a.priority === 'Critica' || a.type === 'Critico');
  const materialPending = data.materials.filter((m: any) => ['Pendiente', 'Pendiente de material'].includes(m.work_orders?.status));
  const kpis = [
    kpiCard('Técnicos disponibles', data.technicians.filter((t: any) => t.active).length, 'Hoy', 'Perfiles técnicos activos', '/app/partes?vista=tecnicos'),
    kpiCard('Técnicos en intervención', inProgress.length, 'Ahora', 'Partes operativos en curso', '/app/partes?estado=en-curso'),
    kpiCard('Partes pendientes', pending.length, 'Actual', 'Pendientes de iniciar o descargar', '/app/partes?estado=pendiente'),
    kpiCard('Partes sin asignar', unassigned.length, 'Actual', 'Sin técnico principal', '/app/partes?filtro=sin-asignar'),
    kpiCard('Partes urgentes', urgent.length, 'Actual', 'Prioridad alta o crítica', '/app/partes?prioridad=critica'),
    kpiCard('No terminados ayer', delayed.length, data.prevDay, 'Arrastrados del día anterior', '/app/partes?filtro=no-terminados'),
    kpiCard('Checks pendientes', data.pendingChecks.length, 'Actual', 'Por realizar o en curso', '/app/checks?estado=por-realizar'),
    kpiCard('Checks realizados hoy', data.completedChecks.length, data.day, 'Finalizados hoy', '/app/checks?estado=realizado'),
    kpiCard('Deficiencias pendientes', openDef.length, 'Actual', 'Pendientes de valoración', '/app/deficiencias?estado=pendiente'),
    kpiCard('Avisos críticos', criticalAlerts.length, 'Actual', 'Prioridad crítica', '/app/avisos?prioridad=critica'),
    kpiCard('Material pendiente', materialPending.length, 'Actual', 'Material asociado a partes pendientes', '/app/partes?filtro=material'),
    kpiCard('Accesos pendientes', data.workOrders.filter((w: any) => !w.site_name).length, 'Actual', 'Partes con contexto incompleto', '/app/partes?filtro=acceso'),
  ];
  return <RoleDashboard title="Inicio SAT" subtitle="Centro operativo de planificación, partes, técnicos, checks y avisos." kpis={kpis} quickActions={<><button onClick={() => setMode('work')}>Crear parte</button><Link to="/app/partes?filtro=sin-asignar">Asignar técnico</Link><button onClick={() => setMode('check')}>Crear check</button><button onClick={() => setMode('alert')}>Crear aviso</button><Link to="/app/partes?fecha=hoy">Abrir planificación</Link><Link to="/app/deficiencias?estado=pendiente">Revisar deficiencia</Link></>}><DashboardList title="Trabajos de hoy" rows={todayWorks.slice(0, 8).map((w: any) => [`${w.scheduled_time ?? 'Sin hora'} · ${w.code}`, `${displayStatus(w.priority)} · ${w.type} · ${w.client_name} · ${w.site_name} · ${w.main_technician_name ?? 'Sin técnico'} · ${displayStatus(w.status)}`, severityForPriority(w.priority), `/app/partes/${w.id}`])} empty="No hay trabajos planificados hoy." /><DashboardList title="Técnicos" rows={data.technicians.slice(0, 6).map((t: any) => [fullName(t), 'Perfil técnico activo · disponibilidad según partes asignados', 'info', '/app/partes?vista=tecnicos'])} empty="Sin técnicos visibles." /><DashboardList title="Alertas operativas" rows={[...delayed, ...unassigned, ...criticalAlerts, ...openDef].slice(0, 8).map((item: any) => [item.code ?? item.title, item.description ?? item.title ?? item.status, severityForStatus(item.status ?? item.priority), item.related_id ? routeForAlert(item) : '/app/partes'])} empty="Sin alertas operativas destacadas." /><DashboardList title="Actividad reciente" rows={data.assignments.slice(0, 8).map((a: any) => [a.work_orders?.code ?? 'Asignación', `${a.assignment_date} · ${fullName(a.profiles)} · ${displayStatus(a.status)}`, severityForStatus(a.status), `/app/partes/${a.work_order_id}`])} empty="Sin actividad reciente." />{mode === 'work' && <WorkOrderForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'alert' && <AlertForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'check' && <CheckForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</RoleDashboard>;
}

function CommercialDashboard() {
  const { data, loading, error, reload } = useLoad(() => dashboardService.getCommercialDashboardData(), [], null as any);
  const [mode, setMode] = useState<'work' | 'alert' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const pendingQuotes = data.quotes.filter((q: any) => q.status === 'Borrador' || q.status === 'Pendiente de valoracion');
  const sentQuotes = data.quotes.filter((q: any) => q.status === 'Enviado');
  const acceptedQuotes = data.quotes.filter((q: any) => q.status === 'Aceptado');
  const openOpps = data.opportunities.filter((o: any) => !['Ganada', 'Perdida', 'Cerrada'].includes(o.status));
  const withoutOwner = openOpps.filter((o: any) => !o.responsible_profile_id);
  const commercialDef = data.deficiencies.filter((d: any) => ['Pendiente de valoracion', 'En valoracion', 'Presupuestada'].includes(d.status));
  const sales = acceptedQuotes.reduce((sum: number, q: any) => sum + Number(q.total ?? 0), 0);
  return <RoleDashboard title="Inicio Comercial" subtitle="Oportunidades, presupuestos, renovaciones y seguimiento comercial." kpis={[kpiCard('Presupuestos pendientes', pendingQuotes.length, 'Actual', 'Borradores y pendientes de valoración', '/app/gerencia?vista=presupuestos'), kpiCard('Presupuestos enviados', sentQuotes.length, 'Actual', 'Pendientes de respuesta', '/app/gerencia?vista=presupuestos&estado=enviado'), kpiCard('Presupuestos aceptados', acceptedQuotes.length, 'Periodo', 'Aceptados en datos actuales', '/app/gerencia?vista=ventas'), kpiCard('Oportunidades abiertas', openOpps.length, 'Actual', 'No cerradas', '/app/deficiencias?origen=oportunidad'), kpiCard('Sin responsable', withoutOwner.length, 'Actual', 'Oportunidades sin responsable', '/app/deficiencias?filtro=sin-responsable'), kpiCard('Deficiencias comerciales', commercialDef.length, 'Actual', 'Con potencial comercial', '/app/deficiencias?estado=valoracion'), kpiCard('Clientes activos', data.clients.filter((c: any) => c.status === 'Activo').length, 'Actual', 'Cartera activa', '/app/clientes?estado=activo'), kpiCard('Ventas del periodo', `${sales.toLocaleString('es-ES')} €`, 'Periodo', 'Total presupuestos aceptados', '/app/gerencia?indicador=ventas')]} quickActions={<><button onClick={() => setMode('work')}>Crear parte</button><Link to="/app/partes?tipo=visita">Crear visita</Link><Link to="/app/deficiencias?origen=oportunidad">Crear oportunidad</Link><Link to="/app/gerencia?vista=presupuestos">Crear presupuesto</Link><button onClick={() => setMode('alert')}>Crear aviso</button><Link to="/app/clientes">Abrir cliente</Link></>}><DashboardList title="Actividad comercial" rows={[...openOpps, ...sentQuotes].slice(0, 8).map((item: any) => [item.code ?? item.title, item.title ?? `${item.clients?.legal_name ?? 'Cliente'} · ${item.status}`, severityForStatus(item.status), item.code?.startsWith('PRE') ? '/app/gerencia?vista=presupuestos' : '/app/deficiencias'])} empty="Sin actividad comercial pendiente." /><DashboardList title="Oportunidades desde deficiencias" rows={commercialDef.slice(0, 8).map((d: any) => [d.clients?.legal_name ?? d.code, `${d.equipment?.code ?? 'Equipo'} · ${d.description} · ${displayStatus(d.severity)} · ${displayStatus(d.status)}`, severityForPriority(d.severity), `/app/deficiencias/${d.id}`])} empty="Sin deficiencias comerciales." />{mode === 'work' && <WorkOrderForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'alert' && <AlertForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</RoleDashboard>;
}

function OfficeDashboard() {
  const { data, loading, error, reload } = useLoad(() => dashboardService.getOfficeDashboardData(), [], null as any);
  const [mode, setMode] = useState<'alert' | 'document' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const pendingDocs = data.documents.filter((d: any) => !d.valid || !d.file_id);
  const pendingRequests = data.materialRequests.filter((r: any) => !['Entregada', 'Cancelada'].includes(r.status));
  const pendingMaterials = data.workOrderMaterials.filter((m: any) => ['Pendiente', 'Pendiente de material'].includes(m.work_orders?.status));
  const adminAlerts = data.alerts.filter((a: any) => ['Administrativo', 'Documentacion', 'Material', 'PRL'].includes(a.type));
  return <RoleDashboard title="Inicio Oficina" subtitle="Tareas administrativas, documentación, compras, proveedores y soporte." kpis={[kpiCard('Documentos pendientes', pendingDocs.length, 'Actual', 'Sin archivo o no válidos', '/app/documentos?estado=pendiente'), kpiCard('Pedidos sin confirmar', pendingRequests.length, 'Actual', 'Solicitudes de material abiertas', '/app/documentos?area=compras'), kpiCard('Material pendiente', pendingMaterials.length, 'Actual', 'Material asociado a partes', '/app/partes?filtro=material'), kpiCard('Avisos administrativos', adminAlerts.length, 'Actual', 'Administración, PRL o documentación', '/app/avisos?tipo=administrativo'), kpiCard('Proveedores', data.suppliers.length, 'Actual', 'Proveedores activos visibles', '/app/documentos?area=proveedores'), kpiCard('Partes consultables', data.workOrders.length, 'Actual', 'Soporte administrativo', '/app/partes')]} quickActions={<><button onClick={() => setMode('alert')}>Crear aviso</button><button onClick={() => setMode('document')}>Registrar documento</button><Link to="/app/documentos?area=compras">Crear pedido</Link><Link to="/app/documentos?area=proveedores">Abrir proveedor</Link><Link to="/app/partes?area=facturacion">Abrir facturación</Link><Link to="/app/partes">Consultar parte</Link></>}><DashboardList title="Facturación y cobros" rows={data.workOrders.slice(0, 6).map((w: any) => [w.code, `${w.client_name} · ${w.scheduled_date ?? 'Sin fecha'} · ${displayStatus(w.status)}`, severityForStatus(w.status), `/app/partes/${w.id}`])} empty="Sin partes recientes para facturación." /><DashboardList title="Compras y proveedores" rows={[...pendingRequests, ...pendingMaterials].slice(0, 8).map((item: any) => [item.work_orders?.code ?? item.materials?.code ?? 'Solicitud', item.notes ?? item.materials?.description ?? displayStatus(item.status), severityForStatus(item.status ?? item.work_orders?.status), item.work_order_id ? `/app/partes/${item.work_order_id}` : '/app/documentos?area=compras'])} empty="Sin compras pendientes." /><DashboardList title="Documentación" rows={pendingDocs.slice(0, 8).map((d: any) => [d.title, `${d.type} · ${d.valid ? 'Pendiente de archivo' : 'No válido'}`, d.valid ? 'warn' : 'danger', `/app/documentos/${d.id}`])} empty="Sin documentación pendiente." />{mode === 'alert' && <AlertForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'document' && <DocumentForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</RoleDashboard>;
}

function ManagementDashboard() {
  const { data, loading, error, reload } = useLoad(() => dashboardService.getManagementDashboardData(), [], null as any);
  const [mode, setMode] = useState<'work' | 'alert' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const done = data.workOrders.filter((w: any) => ['Enviado', 'Cerrado'].includes(w.status));
  const pending = data.workOrders.filter((w: any) => !['Enviado', 'Cerrado', 'Cancelado'].includes(w.status));
  const urgent = data.workOrders.filter((w: any) => ['Alta', 'Critica'].includes(w.priority));
  const openDef = data.deficiencies.filter((d: any) => !['Corregida', 'Cerrada', 'Rechazada'].includes(d.status));
  const amount = Number(data.metrics.accepted_quote_amount ?? 0);
  return <RoleDashboard title="Inicio Gerencia" subtitle="Visión global, rentabilidad, carga operativa y alertas estratégicas." kpis={[kpiCard('Ventas periodo', `${amount.toLocaleString('es-ES')} €`, 'v_management_metrics', 'Presupuestos aceptados', '/app/gerencia?indicador=ventas'), kpiCard('Clientes activos', data.metrics.clients ?? data.clients.length, 'Actual', 'Clientes visibles por RLS', '/app/clientes'), kpiCard('Equipos', data.metrics.equipment ?? 0, 'Actual', 'Inventario instalado', '/app/equipos'), kpiCard('Partes realizados', done.length, 'Actual', 'Enviados o cerrados', '/app/partes?estado=realizado'), kpiCard('Partes pendientes', pending.length, 'Actual', 'Carga abierta', '/app/partes?estado=pendiente'), kpiCard('Partes urgentes', urgent.length, 'Actual', 'Alta o crítica', '/app/partes?prioridad=critica'), kpiCard('Deficiencias abiertas', openDef.length, 'Actual', 'Riesgo técnico/comercial', '/app/deficiencias?estado=abierta'), kpiCard('Oportunidades', data.opportunities.length, 'Actual', 'Pipeline visible', '/app/deficiencias?origen=oportunidad')]} quickActions={<><button onClick={() => setMode('work')}>Crear parte</button><button onClick={() => setMode('alert')}>Crear aviso</button><Link to="/app/gerencia">Abrir informe</Link><Link to="/app/gerencia?indicador=metricas">Consultar métricas</Link><Link to="/app/deficiencias?filtro=desviaciones">Revisar desviaciones</Link><Link to="/app/clientes">Abrir cliente</Link></>}><InteractiveBars title="Trabajos realizados frente a pendientes" values={[['Realizados', done.length, '/app/partes?estado=realizado'], ['Pendientes', pending.length, '/app/partes?estado=pendiente'], ['Urgentes', urgent.length, '/app/partes?prioridad=critica']]} /><InteractiveBars title="Deficiencias por gravedad" values={['Baja','Media','Alta','Critica'].map((level) => [displayStatus(level), data.deficiencies.filter((d: any) => d.severity === level).length, `/app/deficiencias?gravedad=${level}`]) as any} /><DashboardList title="Alertas de dirección" rows={[...data.alerts, ...openDef].slice(0, 8).map((item: any) => [item.title ?? item.code, item.description ?? item.status, severityForStatus(item.status ?? item.priority), item.related_id ? routeForAlert(item) : '/app/deficiencias'])} empty="Sin alertas estratégicas." />{mode === 'work' && <WorkOrderForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'alert' && <AlertForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</RoleDashboard>;
}

function RoleDashboard({ title, subtitle, kpis, quickActions, children }: { title: string; subtitle: string; kpis: any[]; quickActions: ReactNode; children: ReactNode }) {
  return <section className="page dashboard-page"><Breadcrumb items={['Inicio', title]} /><div className="page-head"><div><h2>{title}</h2><p>{subtitle}</p><small>Última actualización: {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small></div></div><div className="stats-grid dashboard-kpis">{kpis.map((item) => <Link key={item.label} className={`metric ${item.tone}`} to={item.route}><div>{item.icon}<span>{item.label}</span></div><strong>{item.value}</strong><small>{item.period} · {item.help}</small></Link>)}</div><Card title="Acciones rápidas"><div className="actions quick-actions">{quickActions}</div></Card><div className="dashboard-grid">{children}</div></section>;
}

function kpiCard(label: string, value: any, period: string, help: string, route: string, tone: Severity = 'info') {
  return { label, value, period, help, route, tone, icon: <Gauge {...iconProps} /> };
}

function DashboardList({ title, rows, empty }: { title: string; rows: [string, string, Severity, string][]; empty: string }) {
  return <Card title={title}>{rows.length ? <div className="compact-list dashboard-list">{rows.map(([head, text, tone, route]) => <article key={`${title}-${head}-${text}`}><Badge tone={tone}>{head}</Badge><p>{text}</p><Link to={route}>Abrir</Link></article>)}</div> : <p className="large-note">{empty}</p>}<Link className="link-button" to={rows[0]?.[3] ? rows[0][3].split('?')[0] : '/app/inicio'}>Ver todos</Link></Card>;
}

function InteractiveBars({ title, values }: { title: string; values: [string, number, string][] }) {
  const max = Math.max(1, ...values.map((item) => item[1]));
  return <Card title={title}><div className="interactive-bars">{values.map(([label, value, route]) => <Link key={label} to={route} title={`Ver registros de ${label}`}><span style={{ height: `${Math.max(12, (value / max) * 120)}px` }} /><strong>{value}</strong><small>{label}</small></Link>)}</div><p className="large-note">Pulsa una barra para ver los registros origen del periodo actual.</p></Card>;
}

function ClientsPage() {
  const [search, setSearch] = useState('');
  const { data, loading, error, reload } = useLoad(() => clientsService.list(search), [search], [] as any[]);
  const [creating, setCreating] = useState(false);
  return <ListPage title="Clientes" summary="Listado conectado a public.clients y public.client_contacts." search={search} setSearch={setSearch} action={<button className="primary" onClick={() => setCreating(true)}>Crear cliente</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="grid half">{data.map((client) => <Card key={client.id} title={client.legal_name} action={<Link to={`/app/clientes/${client.id}`}>Abrir</Link>}><InfoGrid items={[[ 'Código', client.code ], [ 'Nombre comercial', client.trade_name ?? '-' ], [ 'NIF', client.tax_id ?? '-' ], [ 'Estado', client.status ], [ 'Teléfono', client.phone ?? '-' ], [ 'Correo', client.email ?? '-' ], [ 'Centros', String(client.sites?.length ?? 0) ], [ 'Equipos', String(client.equipment?.length ?? 0) ]]} /></Card>)}</div>{creating && <ClientForm title="Crear cliente" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage>;
}

function ClientDetailPage() {
  const { id = '' } = useParams();
  const { data, loading, error, reload } = useLoad(() => clientsService.get(id), [id], null as any);
  const [mode, setMode] = useState<'edit' | 'contact' | 'site' | 'equipment' | 'work' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  return <section className="page"><BackButton /><Hero title={data.legal_name} subtitle={`${data.code} · ${data.status}`} tone={severityForStatus(data.status)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar cliente</button><button onClick={() => setMode('contact')}>Añadir contacto</button><button onClick={() => setMode('site')}>Crear centro</button><button onClick={() => setMode('equipment')}>Crear equipo</button><button onClick={() => setMode('work')}>Crear parte</button></div><div className="grid two-one"><Card title="Datos del cliente"><InfoGrid items={[[ 'Código', data.code ], [ 'Razón social', data.legal_name ], [ 'Nombre comercial', data.trade_name ?? '-' ], [ 'NIF', data.tax_id ?? '-' ], [ 'Dirección', data.address ?? '-' ], [ 'Localidad', data.city ?? '-' ], [ 'Provincia', data.province ?? '-' ], [ 'CP', data.postal_code ?? '-' ], [ 'País', data.country ?? '-' ], [ 'Teléfono', data.phone ?? '-' ], [ 'Correo', data.email ?? '-' ], [ 'Observaciones', data.notes ?? '-' ]]} /></Card><Card title="Contactos"><CompactRows rows={(data.client_contacts ?? []).map((item: any) => [fullName(item), `${item.role ?? '-'} · ${item.email ?? '-'} · ${item.phone ?? '-'}`, item.is_primary ? 'ok' : 'info', `/app/clientes/${data.id}`])} empty="Sin contactos." /></Card></div><Related title="Relaciones" groups={[['Centros', data.sites, '/app/centros'], ['Equipos', data.equipment, '/app/equipos'], ['Expedientes', data.cases, '/app/expedientes'], ['Partes', data.work_orders, '/app/partes']]} />{mode === 'edit' && <ClientForm title="Modificar cliente" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'contact' && <ContactForm clientId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'site' && <SiteForm title="Crear centro" initial={{ client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'equipment' && <EquipmentForm initial={{ client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>;
}

function SitesPage() { const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => sitesService.list(search), [search], [] as any[]); const [creating, setCreating] = useState(false); return <ListPage title="Centros" summary="Centros conectados con cliente, accesos, contactos, equipos y partes." search={search} setSearch={setSearch} action={<button className="primary" onClick={() => setCreating(true)}>Crear centro</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="grid half">{data.map((site) => <Card key={site.id} title={site.name} action={<Link to={`/app/centros/${site.id}`}>Abrir</Link>}><InfoGrid items={[[ 'Código', site.code ], [ 'Cliente', site.clients?.legal_name ?? '-' ], [ 'Dirección', site.address ?? '-' ], [ 'Horario', site.schedule ?? '-' ], [ 'Equipos', String(site.equipment?.length ?? 0) ], [ 'Partes', String(site.work_orders?.length ?? 0) ]]} /></Card>)}</div>{creating && <SiteForm title="Crear centro" onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage>; }

function SiteDetailPage() { const { id = '' } = useParams(); const { data, loading, error, reload } = useLoad(() => sitesService.get(id), [id], null as any); const [mode, setMode] = useState<'edit' | 'contact' | 'equipment' | 'work' | null>(null); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={data.name} subtitle={`${data.code} · ${data.clients?.legal_name ?? ''}`} tone="maintenance" /><div className="actions"><button onClick={() => setMode('edit')}>Modificar centro</button><button onClick={() => setMode('contact')}>Añadir contacto</button><button onClick={() => setMode('equipment')}>Crear equipo</button><button onClick={() => setMode('work')}>Crear parte</button></div><Card title="Datos del centro"><InfoGrid items={[[ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Dirección', data.address ?? '-' ], [ 'Localidad', data.city ?? '-' ], [ 'Provincia', data.province ?? '-' ], [ 'CP', data.postal_code ?? '-' ], [ 'Horario', data.schedule ?? '-' ], [ 'Requisitos de acceso', data.access_requirements?.description ?? '-' ], [ 'Observaciones', data.notes ?? '-' ]]} /></Card><Related title="Relaciones" groups={[['Equipos instalados', data.equipment, '/app/equipos'], ['Expedientes', data.cases, '/app/expedientes'], ['Partes', data.work_orders, '/app/partes']]} />{mode === 'edit' && <SiteForm title="Modificar centro" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'contact' && <SiteContactForm siteId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'equipment' && <EquipmentForm initial={{ client_id: data.client_id, site_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ client_id: data.client_id, site_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>; }

function EquipmentPage() { const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => equipmentService.list(search), [search], [] as any[]); const [creating, setCreating] = useState(false); return <ListPage title="Equipos" summary="Inventario conectado a public.equipment, tipos y componentes." search={search} setSearch={setSearch} action={<button className="primary" onClick={() => setCreating(true)}>Crear equipo</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="grid half">{data.map((item) => <Card key={item.id} title={item.code} action={<Link to={`/app/equipos/${item.id}`}>Abrir</Link>}><InfoGrid items={[[ 'Tipo', item.equipment_types?.name ?? '-' ], [ 'Cliente', item.clients?.legal_name ?? '-' ], [ 'Centro', item.sites?.name ?? '-' ], [ 'Ubicación', item.internal_location ?? '-' ], [ 'Marca/modelo', `${item.brand ?? '-'} ${item.model ?? ''}` ], [ 'Estado', displayStatus(item.status) ], [ 'Próxima revisión', item.next_review_date ?? '-' ]]} /></Card>)}</div>{creating && <EquipmentForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage>; }

function EquipmentDetailPage() { const { id = '' } = useParams(); const navigate = useNavigate(); const { data, loading, error, reload } = useLoad(() => equipmentService.get(id), [id], null as any); const history = useLoad(() => equipmentService.history(id), [id], [] as any[]); const [mode, setMode] = useState<'edit' | 'component' | 'work' | 'check' | null>(null); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.equipment_types?.name ?? 'Equipo'}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar equipo</button><button onClick={() => setMode('component')}>Añadir componente</button><button onClick={() => setMode('work')}>Crear parte desde equipo</button><button onClick={() => setMode('check')}>Crear check desde equipo</button></div><Card title="Identificación"><InfoGrid items={[[ 'Código', data.code ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Ubicación', data.internal_location ?? '-' ], [ 'Fabricante', data.brand ?? '-' ], [ 'Modelo', data.model ?? '-' ], [ 'Serie', data.serial_number ?? '-' ], [ 'Estado', displayStatus(data.status) ], [ 'Criticidad', displayStatus(data.criticality) ]]} /></Card><div className="grid half"><Card title="Componentes"><CompactRows rows={(data.equipment_components ?? []).map((c: any) => [c.component_type, `${c.brand ?? '-'} ${c.model ?? ''} · ${c.status}`, severityForStatus(c.status), `/app/equipos/${id}`])} empty="Sin componentes." /></Card><Card title="Historial"><CompactRows rows={history.data.map((h: any) => [displayStatus(h.event_type), `${formatDate(h.event_at)} · ${h.summary ?? ''} · ${h.detail ?? ''}`, severityForStatus(h.detail), h.event_type === 'parte' ? '/app/partes' : `/app/equipos/${id}`])} empty="Sin historial." /></Card></div><Related title="Relaciones" groups={[['Documentos', data.document_links?.map((l: any) => l.documents), '/app/documentos'], ['Expedientes', data.cases, '/app/expedientes'], ['Partes', data.work_orders, '/app/partes'], ['Checks', data.checks, '/app/checks']]} />{mode === 'edit' && <EquipmentForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'component' && <ComponentForm equipmentId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ client_id: data.client_id, site_id: data.site_id, main_equipment_id: data.id }} onClose={() => setMode(null)} onSaved={(newId) => { setMode(null); if (newId) navigate(`/app/partes/${newId}`); }} />}{mode === 'check' && <CheckForm initial={{ equipment_id: data.id }} onClose={() => setMode(null)} onSaved={(newId) => { setMode(null); if (newId) navigate(`/app/checks/${newId}`); }} />}</section>; }

function CasesPage() { const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => casesService.list(search), [search], [] as any[]); const [creating, setCreating] = useState(false); return <ListPage title="Expedientes" summary="Expedientes con eventos y enlaces reales." search={search} setSearch={setSearch} action={<button className="primary" onClick={() => setCreating(true)}>Crear expediente</button>} loading={loading} error={error} retry={reload} empty={!data.length}><WorkTable rows={data} columns={['code', 'title', 'clients.legal_name', 'status', 'priority']} route="/app/expedientes" /></ListPage>; }

function CaseDetailPage() { const { id = '' } = useParams(); const { data, loading, error, reload } = useLoad(() => casesService.get(id), [id], null as any); const [mode, setMode] = useState<'edit' | 'work' | null>(null); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.title}`} subtitle={`${data.clients?.legal_name ?? ''} · ${displayStatus(data.status)}`} tone={severityForPriority(data.priority)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar expediente</button><button onClick={() => setMode('work')}>Crear parte</button></div><Card title="Datos del expediente"><InfoGrid items={[[ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Tipo', displayStatus(data.type) ], [ 'Prioridad', displayStatus(data.priority) ], [ 'Estado', displayStatus(data.status) ], [ 'Origen', data.origin ], [ 'Descripción', data.description ?? '-' ]]} /></Card><Card title="Cronología"><Timeline items={(data.case_events ?? []).map((event: any) => `${formatDate(event.created_at)} · ${event.event_type} · ${event.description ?? ''}`)} /></Card><Related title="Registros vinculados" groups={[[ 'Vínculos', data.case_links, '/app' ], [ 'Documentos', data.case_documents, '/app/documentos' ]]} />{mode === 'edit' && <CaseForm title="Modificar expediente" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ case_id: data.id, client_id: data.client_id, site_id: data.site_id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>; }

function WorkOrdersPage() {
  const { profile, workspace } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('todos');
  const [person, setPerson] = useState('');
  const { data, loading, error, reload } = useLoad(() => workOrdersService.listWithAssignments(search), [search], [] as any[]);
  const [creating, setCreating] = useState(false);
  const people = Array.from(new Set(data.flatMap((work: any) => [...(work.assignments ?? []).map((item: any) => fullName(item.profiles)), work.commercial_name, work.creator_name].filter(Boolean)))).sort();
  const rows = data.filter((work: any) => {
    const assignedNames = (work.assignments ?? []).map((item: any) => fullName(item.profiles));
    const checks = work.checks ?? [];
    const byFilter = filter === 'todos' || (filter === 'sin-asignar' ? !(work.assignments ?? []).length && !work.main_technician_name : filter === 'checks-pendientes' ? checks.some((check: any) => check.status !== 'Realizado') : filter === 'en-curso' ? ['En desplazamiento','En intervencion','Pausado','Pendiente de envio'].includes(work.status) : filter === 'finalizados' ? ['Finalizado tecnicamente','Enviado','Cerrado'].includes(work.status) : filter === 'urgentes' ? ['Alta','Critica'].includes(work.priority) : work.status === filter);
    const byPerson = !person || assignedNames.includes(person) || work.main_technician_name === person || work.commercial_name === person || work.creator_name === person;
    return byFilter && byPerson;
  });
  return <ListPage title="Partes" summary="Partes SAT con técnicos, comerciales, checks y carga de trabajo asociada." search={search} setSearch={setSearch} action={canCreateWorkOrder(profile) ? <button className="primary" onClick={() => setCreating(true)}>Crear parte</button> : null} loading={loading} error={error} retry={reload} empty={!rows.length}><div className="filters sat-filters"><FormSelect label="Filtro" value={filter} onChange={setFilter} options={[['todos','Todos'],['sin-asignar','Sin asignar'],['checks-pendientes','Checks pendientes'],['en-curso','En curso'],['finalizados','Finalizados'],['urgentes','Urgentes']].map(([value, label]) => ({ value, label }))} /><FormSelect label="Técnico o comercial" value={person} onChange={setPerson} options={people.map((name) => ({ value: name, label: name }))} /></div><div className="sat-work-list">{rows.map((work: any) => <SatWorkOrderCard key={work.id} work={work} />)}</div>{workspace === 'sat' && rows.length === 0 && <p className="large-note">No hay partes para este filtro. Cambia el filtro o la búsqueda.</p>}{creating && <WorkOrderForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage>;
}

function SatWorkOrderCard({ work }: { work: any }) {
  const assignments = work.assignments ?? [];
  const principal = assignments.find((item: any) => item.role === 'Principal')?.profiles;
  const support = assignments.filter((item: any) => item.role !== 'Principal').map((item: any) => fullName(item.profiles)).filter(Boolean);
  const checks = work.checks ?? [];
  const load = `${checks.filter((check: any) => check.status !== 'Realizado').length} checks pendientes · ${assignments.length} asignaciones`;
  return <article className="sat-work-card"><header><div><strong>{work.code} · {work.title}</strong><span>{work.client_name} · {work.site_name} · {work.equipment_code ?? 'Sin equipo'}</span></div><Badge tone={severityForStatus(work.status)}>{displayStatus(work.status)}</Badge></header><div className="sat-assignment-grid"><div><small>Técnico principal</small><b>{principal ? fullName(principal) : work.main_technician_name ?? 'Sin asignar'}</b></div><div><small>Técnicos de apoyo</small><b>{support.length ? support.join(', ') : 'Sin apoyo'}</b></div><div><small>Comercial</small><b>{work.commercial_name ?? work.creator_name ?? 'No informado'}</b></div><div><small>Carga</small><b>{load}</b></div></div><div className="sat-checks"><strong>Checks asignados</strong>{checks.length ? checks.map((check: any) => <span key={check.id}>{check.code} · {fullName(check.profiles) || 'Sin técnico'} · {displayStatus(check.status)} · {displayStatus(check.global_result)}</span>) : <span>Sin checks vinculados</span>}</div><footer><span>{work.scheduled_date ?? 'Sin fecha'} · {work.scheduled_time ?? 'Sin hora'} · Prioridad {displayStatus(work.priority ?? 'Normal')}</span><Link className="primary" to={`/app/partes/${work.id}`}>Abrir</Link></footer></article>;
}

function WorkOrderDetailPage() { const { id = '' } = useParams(); const { profile, workspace } = useAuth(); const { data, loading, error, reload } = useLoad(() => workspace === 'tecnico' ? workOrdersService.getTechnicianAssigned(id) : workOrdersService.get(id), [id, workspace], null as any); const [mode, setMode] = useState<'edit' | 'assign' | 'check' | null>(null); const [message, setMessage] = useState(''); if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />; if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; if (!canViewWorkOrder(profile, data)) return workspace === 'tecnico' ? <AccessDenied /> : <StateBlock loading={false} error="No tienes permiso para acceder a este parte" retry={undefined} empty={false} />; const previous = previousWorkOrderStatus(data.status); const adminActions = canEditWorkOrder(profile); const assignmentAllowed = canAssignTechnician(profile); const workAllowed = canExecuteWorkOrder(profile); const checkAllowed = canCreateCheck(profile); const advance = async () => { if (!workAllowed) return; await workOrdersService.changeStatus(data.id, nextWorkOrderStatus(data.status), 'Cambio operativo desde el parte'); setMessage('Estado actualizado y persistido.'); reload(); }; const goBack = async () => { if (!previous || !workAllowed) return; const reason = window.prompt('Motivo de la corrección de estado'); if (!reason) return; await workOrdersService.changeStatus(data.id, previous, reason, true); setMessage('Estado anterior restaurado conservando historial.'); reload(); }; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.title}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><p className="state-warning"><CheckCircle2 size={17} /> Estado actual del parte: {displayStatus(data.status)}</p><div className="actions">{adminActions && <button onClick={() => setMode('edit')}>Modificar parte</button>}{assignmentAllowed && <button onClick={() => setMode('assign')}>Asignar técnico</button>}{workAllowed && <button onClick={advance}>Avanzar estado</button>}{workAllowed && <button disabled={!previous} onClick={goBack}>Volver al estado anterior</button>}{checkAllowed && <button onClick={() => setMode('check')}>Crear check</button>}{data.main_equipment_id && <Link to={`/app/equipos/${data.main_equipment_id}`}>Abrir equipo</Link>}</div>{workspace === 'tecnico' && <p className="large-note">Vista técnica: solo se permiten acciones operativas del trabajo asignado. La edición administrativa y la asignación de técnicos están bloqueadas.</p>}{message && <p className="state-warning">{message}</p>}<div className="grid two-one"><Card title="Datos principales"><InfoGrid items={[[ 'Expediente', data.cases?.code ?? '-' ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Equipo', data.equipment?.code ?? '-' ], [ 'Tipo', displayStatus(data.type) ], [ 'Prioridad', displayStatus(data.priority) ], [ 'Estado', displayStatus(data.status) ], [ 'Fecha', data.scheduled_date ?? '-' ], [ 'Hora', data.scheduled_time ?? '-' ], [ 'Duración', data.estimated_duration_minutes ? `${data.estimated_duration_minutes} min` : '-' ], [ 'Material previsto', data.planned_material ?? '-' ], [ 'Descripción', data.description ?? '-' ]]} /></Card><Card title="Asignaciones"><CompactRows rows={(data.work_order_assignments ?? []).map((a: any) => [fullName(a.profiles), `${a.assignment_date} · ${a.planned_start_time ?? '-'} · ${a.status}`, severityForStatus(a.status), `/app/partes/${id}`])} empty="Sin técnico asignado." /></Card></div><Card title="Historial de estados"><Timeline items={(data.work_order_status_history ?? []).map((h: any) => `${formatDate(h.changed_at)} · ${displayStatus(h.previous_status)} -> ${displayStatus(h.new_status)} · ${h.reason ?? ''}`)} /></Card><Related title="Relaciones" groups={[[ 'Checks', data.checks, '/app/checks' ], [ 'Deficiencias', data.deficiencies, '/app/deficiencias' ], [ 'Materiales', data.work_order_materials, '/app/partes' ]]} />{mode === 'edit' && <WorkOrderForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'assign' && <AssignmentForm workOrderId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'check' && <CheckForm initial={{ work_order_id: data.id, equipment_id: data.main_equipment_id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>; }

function AccessDenied() { return <section className="page"><Card title="Sin permiso"><p className="form-error">No tienes permiso para acceder a este trabajo</p><Link className="primary" to="/app/tecnico">Volver a Mi jornada</Link></Card></section>; }

function useOfflineQueue(scope?: { workOrderId?: string; checkId?: string }) {
  const [pending, setPending] = useState<any[]>([]);
  const reload = async () => setPending(scope?.checkId ? await technicianOfflineService.pendingForCheck(scope.checkId) : scope?.workOrderId ? await technicianOfflineService.pendingForWorkOrder(scope.workOrderId) : await technicianOfflineService.pending());
  useEffect(() => { reload(); window.addEventListener('dmp-offline-queue-changed', reload); return () => window.removeEventListener('dmp-offline-queue-changed', reload); }, [scope?.workOrderId, scope?.checkId]);
  return { pending, summary: technicianOfflineService.summarize(pending), reload };
}

function SyncButton({ workOrderId, checkId }: { workOrderId?: string; checkId?: string }) {
  const { pending, summary, reload } = useOfflineQueue({ workOrderId, checkId });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const sync = async () => {
    if (!pending.length || syncing) return;
    setSyncing(true); setMessage(`Pendientes: ${summary.total}. Bloques: ${summary.blocks}. Incidencias: ${summary.incidences}. Fotos: ${summary.photos}. Materiales: ${summary.materials}. Firmas: ${summary.signatures}.`);
    const result = await technicianOfflineService.sync(setMessage);
    setMessage(`Sincronizados: ${result.synced}. Fallidos: ${result.failed}. Pendientes: ${result.pending}.`);
    setSyncing(false); reload();
  };
  return <div className="sync-box"><button className="primary" disabled={!pending.length || syncing} onClick={sync}>{syncing ? 'Sincronizando...' : `Sincronizar (${pending.length})`}</button>{pending.length > 0 && <Link to="/app/pendientes">Ver pendientes</Link>}{message && <p>{message}</p>}</div>;
}

function PendingSyncPage() {
  const { pending, summary, reload } = useOfflineQueue();
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const sync = async () => { setSyncing(true); const result = await technicianOfflineService.sync(setMessage); setMessage(`Sincronizados: ${result.synced}. Fallidos: ${result.failed}. Pendientes: ${result.pending}.`); setSyncing(false); reload(); };
  return <section className="page technician-page"><BackButton /><div className="page-head"><div><h2>Pendientes de sincronizar</h2><p>Datos técnicos guardados en este dispositivo hasta que Supabase confirme la sincronización.</p></div><button className="primary" disabled={!pending.length || syncing} onClick={sync}>{syncing ? 'Sincronizando...' : 'Sincronizar todo'}</button></div><Card title="Resumen"><InfoGrid items={[[ 'Total', summary.total ], [ 'Bloques', summary.blocks ], [ 'Incidencias', summary.incidences ], [ 'Materiales', summary.materials ], [ 'Fotos', summary.photos ], [ 'Firmas', summary.signatures ]]} />{message && <p className="success-note">{message}</p>}</Card><div className="compact-list">{pending.map((item) => <article key={item.id}><Badge tone={item.status === 'failed' ? 'warn' : 'info'}>{item.status === 'failed' ? 'Fallido' : item.status === 'syncing' ? 'Sincronizando' : 'Pendiente'}</Badge><p><strong>{displayStatus(item.type)}</strong><br /><small>Parte: {item.workOrderId ?? '-'} · Check: {item.checkId ?? '-'} · Bloque: {item.blockId ?? '-'}</small><br /><small>Fecha: {formatDate(item.updatedAt)} · Intentos: {item.attempts ?? 0}</small></p>{item.error && <p className="form-error">{item.error}</p>}<button onClick={sync} disabled={syncing}>Reintentar</button></article>)}</div>{!pending.length && <Card title="Sin pendientes"><p className="large-note">No hay cambios locales pendientes o fallidos.</p></Card>}</section>;
}

function TechnicianDayPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'hoy' | 'anteriores' | 'urgentes' | 'curso' | 'finalizados' | 'checks' | 'sin-hora'>('hoy');
  const { data, loading, error, reload } = useLoad(() => assignmentsService.assignedWork(), [], [] as any[]);
  const { pending } = useOfflineQueue();
  const today = new Date().toISOString().slice(0, 10);
  const rows = data.filter((row) => tab === 'hoy' ? row.assignment_date === today : tab === 'anteriores' ? row.assignment_date < today && !['Enviado','Cerrado','Cancelado'].includes(row.work_order_status) : tab === 'urgentes' ? ['Alta','Critica'].includes(row.priority) : tab === 'curso' ? ['En desplazamiento','En intervencion','Finalizado tecnicamente','Pendiente de envio'].includes(row.work_order_status) : tab === 'finalizados' ? ['Enviado','Cerrado'].includes(row.work_order_status) : tab === 'checks' ? row.check_status && row.check_status !== 'Realizado' : !row.planned_start_time);
  return <section className="page technician-page"><div className="page-head"><div><p className="eyebrow">Trabajo técnico</p><h2>Mi jornada</h2><p>Solo partes asignados como técnico principal o de apoyo.</p></div><SyncButton /></div><div className="tabs">{[['hoy','Hoy'],['anteriores','Pendientes anteriores'],['urgentes','Urgentes'],['curso','En curso'],['finalizados','Finalizados'],['checks','Checks pendientes'],['sin-hora','Sin hora']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key as any)}>{label}</button>)}</div><StateBlock loading={loading} error={error} retry={reload} empty={!rows.length}>{rows.map((work) => { const local = pending.filter((item) => item.workOrderId === work.work_order_id).length; return <article className="journey-card" key={`${work.work_order_id}-${work.assignment_date}`}><div><strong>{work.planned_start_time ?? 'Sin hora'} · {work.code ?? work.work_order_code} · {work.title}</strong><span>{displayStatus(work.work_order_status)} · Prioridad {displayStatus(work.priority ?? 'Normal')}</span><span>{work.client_name} · {work.site_name}</span><span>{work.site_address ?? work.address ?? 'Dirección no informada'}</span><span>{work.equipment_code ?? 'Sin equipo'} · {displayStatus(work.type ?? 'Trabajo técnico')}</span><p>{work.description ?? work.work_order_description ?? 'Sin descripción breve.'}</p><small>Acceso: {work.access_description ?? work.access_requirements ?? 'No informado'} · Material previsto: {work.planned_material ?? 'No informado'}</small></div><div><Badge tone={severityForStatus(work.work_order_status)}>{displayStatus(work.work_order_status)}</Badge>{work.check_status && <small>Check: {displayStatus(work.check_status)}</small>}{local > 0 && <Badge tone="warn">{local} cambios locales</Badge>}<button className="primary" onClick={() => navigate(`/app/tecnico/trabajo/${work.work_order_id}`)}>Abrir trabajo</button></div></article>; })}</StateBlock></section>;
}

function TechnicianWorkPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data, loading, error, reload } = useLoad(() => workOrdersService.getTechnicianAssigned(id), [id], null as any);
  const [message, setMessage] = useState('');
  if (loading) return <StateBlock loading={loading} retry={reload} empty={false} />;
  if (error || !data) return <section className="page"><Card title="Sin permiso"><p className="form-error">No tienes permiso para acceder a este parte</p><Link className="primary" to="/app/tecnico">Volver a Mi jornada</Link></Card></section>;
  if (!canViewWorkOrder(profile, data)) return <section className="page"><Card title="Sin permiso"><p className="form-error">No tienes permiso para acceder a este parte</p><Link className="primary" to="/app/tecnico">Volver a Mi jornada</Link></Card></section>;
  const advance = async (status: string) => { await workOrdersService.changeStatus(data.id, status, 'Cambio operativo desde modo técnico'); setMessage(`Estado actualizado: ${displayStatus(status)}`); reload(); };
  return <section className="page technician-page"><BackButton /><Hero title={`${data.code} · ${data.title}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><p className="state-warning"><CheckCircle2 size={17} /> Estado actual del parte: {displayStatus(data.status)}</p>{message && <p className="success-note">{message}</p>}<div className="actions"><button onClick={() => advance(nextWorkOrderStatus(data.status))}>Iniciar / avanzar</button><button onClick={() => advance('Pausado')}>Pausar</button><button onClick={() => advance('Finalizado tecnicamente')}>Finalizar técnicamente</button><SyncButton workOrderId={id} /></div><div className="grid half"><Card title="Datos para la intervención"><InfoGrid items={[[ 'Prioridad', displayStatus(data.priority) ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Dirección', data.sites?.address ?? '-' ], [ 'Equipo principal', data.primary_equipment?.code ?? '-' ], [ 'Tipo de trabajo', displayStatus(data.type) ], [ 'Horario', `${data.scheduled_date ?? '-'} ${data.scheduled_time ?? ''}` ], [ 'Acceso', data.access_requirement?.description ?? '-' ], [ 'Material previsto', data.planned_material ?? '-' ], [ 'Descripción', data.description ?? '-' ]]}/></Card><Card title="Checks vinculados"><CompactRows rows={(data.checks ?? []).map((check: any) => [check.code, `${check.equipment?.code ?? 'Equipo'} · ${displayStatus(check.status)} · ${displayStatus(check.global_result)}`, severityForStatus(check.global_result), `/app/checks/${check.id}`])} empty="Sin checks vinculados." /></Card></div><div className="grid half"><TechnicianLocalForm workOrderId={id} type="work-note" title="Diagnóstico e intervención" fields={[['diagnosis','Diagnóstico'],['work','Trabajo realizado'],['observations','Observaciones']]} /><TechnicianLocalForm workOrderId={id} type="material" title="Materiales usados" fields={[['material','Material'],['quantity','Cantidad'],['observations','Observación']]} /></div><Card title="Fotos, incidencias y firma"><div className="actions"><button onClick={() => technicianOfflineService.upsert({ type: 'photo', workOrderId: id, payload: { note: 'Foto pendiente de adjuntar', photos: [] } })}>Añadir foto</button><button onClick={() => technicianOfflineService.upsert({ type: 'work-note', workOrderId: id, payload: { incidence: true, observations: 'Incidencia técnica pendiente de completar' } })}>Crear incidencia</button><button onClick={() => technicianOfflineService.upsert({ type: 'signature', workOrderId: id, payload: { signature: true } })}>Firmar pendiente</button></div></Card><Card title="Historial técnico"><Timeline items={(data.status_history ?? []).map((item: any) => `${formatDate(item.changed_at)} · ${displayStatus(item.new_status)} · ${item.reason ?? ''}`)} /></Card></section>;
}

function TechnicianLocalForm({ workOrderId, type, title, fields }: any) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const save = async () => { await technicianOfflineService.upsert({ type, workOrderId, payload: values }); setMessage('Guardado en dispositivo. Pendiente de sincronizar.'); };
  return <Card title={title}>{fields.map(([key, label]: any[]) => <label key={key}>{label}<textarea value={values[key] ?? ''} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}<button className="primary wide" onClick={save}>Guardar localmente</button>{message && <p className="success-note">{message}</p>}</Card>;
}

function ChecksPage() { const { profile, workspace } = useAuth(); const [tab, setTab] = useState<'pending' | 'done'>('pending'); const loader = () => workspace === 'tecnico' ? (tab === 'pending' ? checksService.pendingForCurrentTechnician() : checksService.completedForCurrentTechnician()) : (tab === 'pending' ? checksService.pending() : checksService.completed()); const { data, loading, error, reload } = useLoad(loader, [tab, workspace], [] as any[]); const [creating, setCreating] = useState(false); return <section className="page"><div className="page-head"><div><h2>Checks</h2><p>{workspace === 'tecnico' ? 'Checks asignados al técnico autenticado.' : 'Por realizar y realizados con datos reales.'}</p></div>{canCreateCheck(profile) && workspace !== 'tecnico' && <button className="primary" onClick={() => setCreating(true)}>Crear check</button>}</div><div className="tabs"><button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Por realizar</button><button className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>Realizados</button></div><StateBlock loading={loading} error={error} retry={reload} empty={!data.length}><WorkTable rows={data} columns={['code', 'equipment_code', 'work_order_code', 'status', 'global_result']} route="/app/checks" /></StateBlock>{creating && <CheckForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</section>; }

function CheckDetailPage() {
  const { id = '' } = useParams();
  const { workspace } = useAuth();
  const { data, loading, error, reload } = useLoad(() => workspace === 'tecnico' ? checksService.getTechnicianAssigned(id) : checksService.get(id), [id, workspace], null as any);
  const [mode, setMode] = useState<'finish' | null>(null);
  const { pending } = useOfflineQueue({ checkId: id });
  if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />;
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const template = templateForEquipment(data.equipment);
  const zones = visibleTemplateZones(data.equipment);
  const physicalZones = physicalTemplateZones(data.equipment);
  const sectionStatus = (zone: CheckBlockId) => {
    const zoneConfig = zones.find((item) => item.id === zone) ?? sectionalZones.find((item) => item.id === zone);
    const local = pending.find((item) => item.type === 'check-block' && item.blockId === zone);
    if (local?.payload?.status) return local.payload.status;
    const result = data.check_section_results?.find((item: any) => normalize(item.check_template_sections?.title ?? '') === normalize(zoneConfig?.name ?? ''));
    return result?.result ?? 'Sin revisar';
  };
  const incidences = (zone: CheckBlockId) => pending.filter((item) => item.blockId === zone && item.payload.incidence).length;
  const reviewed = zones.filter((zone) => sectionStatus(zone.id) !== 'Sin revisar').length;
  const globalResult = zones.some((zone) => sectionStatus(zone.id) === 'No favorable') ? 'No favorable' : zones.some((zone) => sectionStatus(zone.id) === 'Problema leve') ? 'Problema leve' : 'Todo favorable';
  return <section className="check-mobile"><BackButton /><header><p className="eyebrow">Check {template.name}</p><h2>{data.code} · {data.equipment?.code}</h2><p>{reviewed} de {zones.length} bloques revisados</p>{template.placeholder && <p className="large-note">Falta imagen específica de este equipo. Se usa un esquema profesional temporal.</p>}<SyncButton checkId={id} /></header><div className="progress"><span style={{ width: `${Math.min(100, (reviewed / zones.length) * 100)}%` }} /></div><div className={`door-check ${template.placeholder ? 'placeholder' : ''}`} aria-label="Zonas táctiles del equipo">{template.image ? <img src={template.image} alt={template.name} /> : <div className="equipment-placeholder"><Factory size={48} /><strong>{template.name}</strong><span>Imagen específica pendiente</span></div>}{physicalZones.map((zone) => <Link key={zone.id} style={{ ...zone.area, zIndex: zone.zIndex }} className={`hotspot ${severityForStatus(sectionStatus(zone.id))}`} to={`/app/checks/${id}/bloque/${zone.id}`} aria-label={`Revisar ${zone.name}`}><span>{zone.name}</span></Link>)}</div><div className="block-list status-summary" aria-label="Resumen de bloques revisados">{zones.map((zone) => <article key={zone.id}><div><strong>{zone.name}</strong><small>{incidences(zone.id)} incidencias · {pending.some((item) => item.blockId === zone.id) ? 'Pendiente de sincronizar' : 'Sincronizado'} · {sectionStatus(zone.id) === 'No favorable' ? 'Gravedad alta' : sectionStatus(zone.id) === 'Problema leve' ? 'Gravedad leve' : 'Sin gravedad'}</small></div><Badge tone={severityForStatus(sectionStatus(zone.id))}>{displayStatus(sectionStatus(zone.id))}</Badge></article>)}</div><button className="primary wide big" disabled={reviewed < zones.length} onClick={() => setMode('finish')}>Finalizar check</button>{reviewed < zones.length && <p className="large-note">Para finalizar, todos los bloques deben estar revisados o marcados como No aplicable.</p>}{mode === 'finish' && <ConfirmModal title="Completar check" text="Se finalizará el check en Supabase. Sincroniza antes los bloques pendientes." onCancel={() => setMode(null)} onConfirm={async () => { await checksService.finish(id, globalResult); setMode(null); reload(); }} />}</section>;
}

function CheckBlockPage() {
  const { id = '', blockId = 'hoja' } = useParams();
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { data, loading, error, reload } = useLoad(() => workspace === 'tecnico' ? checksService.getTechnicianAssigned(id) : checksService.get(id), [id, workspace], null as any);
  const [status, setStatus] = useState('Sin revisar');
  const [confirmedStatus, setConfirmedStatus] = useState('Sin revisar');
  const [observations, setObservations] = useState('');
  const [intervention, setIntervention] = useState('');
  const [severity, setSeverity] = useState('Leve');
  const [components, setComponents] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const zones = data ? visibleTemplateZones(data.equipment) : sectionalZones;
  const zone = zones.find((item) => item.id === blockId as CheckBlockId) ?? zones[0];
  const zoneIndex = zones.findIndex((item) => item.id === zone.id);
  const section = data?.check_templates?.check_template_sections?.find((item: any) => normalize(item.title) === normalize(zone.name)) ?? data?.check_templates?.check_template_sections?.[zoneIndex] ?? { id: `local-${zone.id}`, check_template_items: zone.components.map((component) => ({ id: `local-${zone.id}-${component}`, title: component })) };
  const existing = data?.check_section_results?.find((item: any) => item.section_id === section?.id);
  useEffect(() => {
    technicianOfflineService.sectionState(id, blockId).then((local) => {
      if (local) {
        setStatus(local.status); setConfirmedStatus(local.status); setObservations(local.observations ?? ''); setIntervention(local.intervention ?? ''); setSeverity(local.severity ?? 'Leve'); setComponents(local.components ?? []); setPhotos(local.photos ?? []);
      } else if (existing) {
        const normalized = existing.result === 'Favorable tras intervencion' ? 'Favorable tras intervención' : existing.result;
        setStatus(normalized); setConfirmedStatus(normalized);
      }
      setLocalLoaded(true);
    });
  }, [existing?.id, existing?.result]);
  if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />;
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const hasChanges = localLoaded && (status !== confirmedStatus || observations.trim() || intervention.trim() || components.length || photos.length);
  const toggleComponent = (component: string) => setComponents((current) => current.includes(component) ? current.filter((item) => item !== component) : [...current, component]);
  const save = async () => {
    if (!section || !hasChanges || status === 'Sin revisar') return;
    setSaving(true); setSaveState('saving');
    const persisted = status.replace('Favorable tras intervención', 'Favorable tras intervencion');
    try {
      await technicianOfflineService.upsert({ type: 'check-block', workOrderId: data.work_order_id, checkId: id, blockId, payload: { blockId, sectionId: section.id, status, persistedStatus: persisted, items: section.check_template_items ?? [], components: status === 'Todo favorable' ? (zone.components ?? []) : components, observations: ['Todo favorable', 'No aplicable'].includes(status) ? '' : observations, intervention: ['Todo favorable', 'No aplicable'].includes(status) ? '' : intervention, incidence: checkProblemStatuses.includes(status), severity, photos, date: new Date().toISOString(), user: data.technician_id } });
      setConfirmedStatus(status); setSaveState('saved');
      setTimeout(() => navigate(`/app/checks/${id}`), 450);
    } catch { setSaveState('error'); }
    finally { setSaving(false); }
  };
  return <section className="check-mobile block-page"><button className="link-button sticky-back" onClick={() => navigate(`/app/checks/${id}`)}><ChevronLeft size={16} /> Volver a la puerta</button><header><p className="eyebrow">Detalle del bloque</p><h2>{zone.name}</h2><Badge tone={severityForStatus(status)}>{displayStatus(status)}</Badge></header><div className="status-grid">{checkStatuses.map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>{item}</button>)}</div>{status === 'Sin revisar' && <p className="large-note">Selecciona un estado. No se guardará hasta pulsar Confirmar selección.</p>}{checkProblemStatuses.includes(status) && <Card title="Incidencia del bloque"><div className="component-select">{zone.components.map((component) => <label key={component}><input type="checkbox" checked={components.includes(component)} onChange={() => toggleComponent(component)} /> {component}</label>)}</div><FormSelect label="Gravedad" value={severity} onChange={setSeverity} options={['Leve','Media','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /><label>Observación<textarea value={observations} onChange={(event) => setObservations(event.target.value)} /></label><label>Intervención<textarea value={intervention} onChange={(event) => setIntervention(event.target.value)} placeholder="Intervención realizada si aplica" /></label><div className="photo-strip"><button type="button" onClick={() => setPhotos((current) => [...current, `Foto local ${current.length + 1}`])}>Añadir foto</button></div>{photos.length > 0 && <div className="photo-list">{photos.map((photo) => <span key={photo}>{photo}<button onClick={() => setPhotos((current) => current.filter((item) => item !== photo))}>Quitar</button></span>)}</div>}</Card>}<div className="confirm-bar"><button className="primary wide big" disabled={saving || !hasChanges || status === 'Sin revisar'} onClick={save}>{saveState === 'saving' ? 'Guardando' : saveState === 'saved' ? 'Guardado en dispositivo' : saveState === 'error' ? 'Reintentar' : 'Confirmar selección'}</button>{saveState === 'error' && <p className="form-error">Error al guardar en el dispositivo.</p>}</div></section>;
}

function DeficienciesPage() { const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => deficienciesService.list(search), [search], [] as any[]); return <ListPage title="Deficiencias" summary="Deficiencias y acciones correctivas conectadas." search={search} setSearch={setSearch} loading={loading} error={error} retry={reload} empty={!data.length}><WorkTable rows={data} columns={['code', 'description', 'severity', 'status']} route="/app/deficiencias" /></ListPage>; }

function DeficiencyDetailPage() { const { id = '' } = useParams(); const { data, loading, error, reload } = useLoad(() => deficienciesService.get(id), [id], null as any); const [action, setAction] = useState(''); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.description}`} subtitle={`${data.clients?.legal_name ?? ''} · ${displayStatus(data.status)}`} tone={severityForPriority(data.severity)} /><div className="actions"><Link to={`/app/partes/${data.work_order_id}`}>Abrir parte</Link><Link to={`/app/equipos/${data.equipment_id}`}>Abrir equipo</Link><button onClick={async () => { await deficienciesService.update(id, { status: 'En valoracion' }); reload(); }}>Cambiar estado</button></div><Card title="Detalle"><InfoGrid items={[[ 'Gravedad', displayStatus(data.severity) ], [ 'Estado', displayStatus(data.status) ], [ 'Acción recomendada', data.recommended_action ?? '-' ], [ 'Responsable', fullName(data.profiles) ]]} /></Card><Card title="Acciones correctivas"><form onSubmit={async (event) => { event.preventDefault(); await deficienciesService.addAction(id, { description: action }); setAction(''); reload(); }}><label>Añadir acción recomendada<input value={action} onChange={(event) => setAction(event.target.value)} required /></label><button className="primary">Guardar acción</button></form><Timeline items={(data.corrective_actions ?? []).map((item: any) => `${displayStatus(item.status)} · ${item.description}`)} /></Card></section>; }

function AlertsPage() {
  const { workspace } = useAuth();
  const [creating, setCreating] = useState(false);
  const canCreate = ['sat', 'gerencia', 'comercial', 'tecnico'].includes(workspace);
  return <section className="page"><div className="page-head"><div><h2>Avisos</h2><p>Leer, abrir, ir al registro, cerrar y reabrir funcionan contra Supabase.</p></div>{canCreate && <button className="primary" onClick={() => setCreating(true)}>Crear aviso</button>}</div><AlertsPanel showFilters />{creating && <AlertForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); window.dispatchEvent(new Event('dmp-alerts-changed')); }} />}</section>;
}

function AlertsPanel({ onClose, showFilters = false }: { onClose?: () => void; showFilters?: boolean }) {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(() => alertsService.list(), [], [] as any[]);
  const [filter, setFilter] = useState('todos');
  const notify = () => window.dispatchEvent(new Event('dmp-alerts-changed'));
  const markRead = async (row: any) => { if (!row.is_read) await alertsService.markAsRead(row.id); notify(); await reload(); };
  const open = async (row: any) => { await markRead(row); const route = routeForAlert(row.alerts); onClose?.(); navigate(route); };
  const close = async (row: any) => { await alertsService.close(row.id); notify(); await reload(); };
  const reopen = async (row: any) => { await alertsService.reopen(row.id); notify(); await reload(); };
  const filtered = data.filter((row) => {
    const alert = row.alerts;
    if (filter === 'sin-leer') return !row.is_read && !row.closed_at;
    if (filter === 'leidos') return row.is_read && !row.closed_at;
    if (filter === 'abiertos') return !row.closed_at;
    if (filter === 'cerrados') return Boolean(row.closed_at);
    if (filter === 'alta') return ['Alta', 'Critica'].includes(alert.priority);
    if (filter === 'criticos') return alert.priority === 'Critica' || alert.type === 'Critico';
    return true;
  });
  return <StateBlock loading={loading} error={error} retry={reload} empty={false}>{showFilters && <div className="alert-filters"><div className="tabs">{[['todos','Todos'],['sin-leer','Sin leer'],['leidos','Leídos'],['abiertos','Abiertos'],['cerrados','Cerrados'],['alta','Alta prioridad'],['criticos','Críticos']].map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><p className="large-note">Filtro activo: {filter.replace('-', ' ')} · {filtered.length} resultado(s)</p><button className="link-button" onClick={() => setFilter('todos')}>Restablecer filtros</button></div>}{!filtered.length ? <Card title="Sin avisos para este filtro"><p className="large-note">No hay avisos que cumplan el filtro seleccionado. Puedes restablecer filtros o crear un aviso nuevo si tu rol lo permite.</p></Card> : <div className="alerts-panel compact-list">{filtered.map((row) => { const alert = row.alerts; return <article key={row.id} className={row.is_read ? 'read' : ''}><Badge tone={severityForPriority(alert.priority)}>{alert.title}</Badge><p>{alert.description}<br /><small>{formatDate(alert.alert_date)} · {displayStatus(alert.status)} · {row.closed_at ? 'Cerrado' : row.is_read ? 'Leído' : 'Sin leer'}</small></p><div className="row-actions"><button onClick={() => markRead(row)} disabled={row.is_read}>Leer</button><button onClick={() => open(row)}>Abrir</button><button onClick={() => open(row)}>Ir al registro</button>{row.closed_at ? <button onClick={() => reopen(row)}>Reabrir</button> : <button onClick={() => close(row)}>Cerrar</button>}</div></article>; })}</div>}</StateBlock>;
}

function DocumentsPage() { const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => documentsService.list(search), [search], [] as any[]); const [creating, setCreating] = useState(false); return <ListPage title="Documentación" summary="Documentos y vínculos conectados a public.documents y document_links." search={search} setSearch={setSearch} action={<button className="primary" onClick={() => setCreating(true)}>Crear documento</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="doc-list">{data.map((doc) => <article key={doc.id}><FileText size={17} /><div><strong>{doc.title}</strong><span>{doc.type} · {doc.origin ?? 'Sin origen'}</span></div><Link to={`/app/documentos/${doc.id}`}>Abrir</Link></article>)}</div>{creating && <DocumentForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage>; }

function DocumentDetailPage() { const { id = '' } = useParams(); const { data, loading, error, reload } = useLoad(() => documentsService.get(id), [id], null as any); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={data.title} subtitle={`${data.type} · ${data.version ?? 'sin versión'}`} tone="info" /><Card title="Ficha documental"><InfoGrid items={[[ 'Tipo', data.type ], [ 'Fecha', data.document_date ?? '-' ], [ 'Origen', data.origin ?? '-' ], [ 'Disponible offline', data.available_offline ? 'Sí' : 'No' ], [ 'Archivo real', data.file_id ? 'Sí' : 'No' ], [ 'URL', data.url ?? 'Ficha simulada sin archivo real' ], [ 'Observaciones', data.observations ?? '-' ]]} /></Card><Card title="Vínculos"><CompactRows rows={(data.document_links ?? []).map((l: any) => [l.related_type, l.related_value ?? l.related_id, 'info', '/app/documentos'])} empty="Sin vínculos." /></Card></section>; }

function ManagementPage() { const { data, loading, error, reload } = useLoad(() => managementService.metrics(), [], [] as any[]); const row = data[0] ?? {}; return <section className="page"><Breadcrumb items={['Gerencia', 'Métricas']} /><div className="page-head"><div><h2>Métricas básicas</h2><p>Proceden de public.v_management_metrics. Periodo: mes actual para partes y presupuestos aceptados.</p></div></div><StateBlock loading={loading} error={error} retry={reload} empty={!data.length}><div className="stats-grid">{[['Clientes', row.clients, '/app/clientes'], ['Equipos', row.equipment, '/app/equipos'], ['Partes del mes', row.work_orders_this_month, '/app/partes'], ['Presupuestos aceptados', row.accepted_quotes, '/app/partes'], ['Importe aceptado', `${row.accepted_quote_amount ?? 0} €`, '/app/partes']].map(([label, value, route]) => <Link key={label} className="metric info" to={String(route)}><div><Gauge {...iconProps} /><span>{label}</span></div><strong>{value}</strong><small>Abrir registros que producen el valor</small></Link>)}</div></StateBlock></section>; }

function ModulePage() { const { moduleId = '' } = useParams(); const { workspace } = useAuth(); if (moduleId === 'tecnicos') return <TechniciansModule />; const meta = moduleMeta[moduleId] ?? { title: 'Módulo en preparación', description: 'Este módulo tendrá su propia pantalla y no redirige a otro módulo incorrecto.', links: [] }; return <section className="page"><Breadcrumb items={[workspaceTitles[workspace], meta.title]} /><Hero title={meta.title} subtitle={meta.description} tone="info" /><Card title="Estado del módulo"><p className="large-note">Pantalla real reservada para {meta.title}. La navegación ya no abre Partes, Documentación o Gerencia como sustituto incorrecto.</p><div className="actions">{meta.links.map((link: any) => <Link key={link.to} to={link.to}>{link.label}</Link>)}</div></Card></section>; }

function TechniciansModule() {
  const [filter, setFilter] = useState('todos');
  const technicians = useLoad(() => profilesService.listTechnicians(), [], [] as any[]);
  const workOrders = useLoad(() => workOrdersService.list(), [], [] as any[]);
  const checks = useLoad(() => checksService.pending(), [], [] as any[]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = technicians.data.map((tech) => {
    const assigned = workOrders.data.filter((work) => work.main_technician_id === tech.id || work.current_responsible_id === tech.id || work.main_technician_name === fullName(tech));
    const todayWorks = assigned.filter((work) => work.scheduled_date === today);
    const inProgress = assigned.filter((work) => ['En desplazamiento','En intervencion','Pausado'].includes(work.status));
    const pending = assigned.filter((work) => ['Pendiente','Trabajo descargado','Pendiente de material'].includes(work.status));
    const urgent = assigned.some((work) => ['Alta','Critica'].includes(work.priority));
    const pendingChecks = checks.data.filter((check) => check.technician_id === tech.id || check.technician_name === fullName(tech)).length;
    const availability = !tech.active ? 'Fuera de servicio' : inProgress.length ? 'Ocupado' : 'Disponible';
    return { tech, assigned, todayWorks, inProgress, pending, urgent, pendingChecks, availability };
  }).filter((row) => filter === 'todos' || (filter === 'disponibles' && row.availability === 'Disponible') || (filter === 'ocupados' && row.availability === 'Ocupado') || (filter === 'fuera' && row.availability === 'Fuera de servicio') || (filter === 'urgentes' && row.urgent));
  return <section className="page"><Breadcrumb items={['SAT', 'Técnicos']} /><Hero title="Técnicos SAT" subtitle="Disponibilidad, carga diaria, partes, checks y documentación operativa desde Supabase." tone="maintenance" /><div className="tabs">{[['todos','Todos'],['disponibles','Disponibles'],['ocupados','Ocupados'],['fuera','Fuera de servicio'],['urgentes','Con urgentes']].map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><StateBlock loading={technicians.loading || workOrders.loading || checks.loading} error={technicians.error || workOrders.error || checks.error} retry={() => { technicians.reload(); workOrders.reload(); checks.reload(); }} empty={!rows.length}><div className="grid half">{rows.map(({ tech, todayWorks, inProgress, pending, pendingChecks, availability }) => <Card key={tech.id} title={fullName(tech)} action={<Link to={`/app/partes?tecnico=${tech.id}`}>Abrir ficha</Link>}><InfoGrid items={[[ 'Estado', tech.active ? 'Activo' : 'Inactivo' ], [ 'Disponibilidad', availability ], [ 'Especialidad', tech.specialty ?? tech.primary_area ?? '-' ], [ 'Teléfono', tech.phone ?? '-' ], [ 'Correo', tech.email ?? '-' ], [ 'Vehículo asignado', tech.vehicle ?? 'No informado' ], [ 'Partes hoy', String(todayWorks.length) ], [ 'En curso', String(inProgress.length) ], [ 'Pendientes', String(pending.length) ], [ 'Checks pendientes', String(pendingChecks) ], [ 'Carga de trabajo', `${todayWorks.length + pending.length} tareas` ], [ 'Última actividad', tech.updated_at ? formatDate(tech.updated_at) : '-' ]]} /><div className="actions"><Link to={`/app/partes?tecnico=${tech.id}`}>Ver trabajos</Link><Link to={`/app/partes?fecha=${today}&tecnico=${tech.id}`}>Ver agenda</Link><Link to={`/app/documentos?tecnico=${tech.id}`}>Documentación PRL</Link><Link to={`/app/modulos/vehiculos?tecnico=${tech.id}`}>Vehículo</Link><Link to="/app/avisos">Alertas</Link></div></Card>)}</div></StateBlock></section>;
}

const moduleMeta: Record<string, { title: string; description: string; links: { label: string; to: string }[] }> = {
  planificacion: { title: 'Planificación', description: 'Agenda operativa de SAT y planificación de recursos.', links: [{ label: 'Ver partes', to: '/app/partes' }] },
  tecnicos: { title: 'Técnicos', description: 'Disponibilidad, carga diaria y asignaciones técnicas.', links: [{ label: 'Partes sin asignar', to: '/app/partes?filtro=sin-asignar' }] },
  oportunidades: { title: 'Oportunidades', description: 'Pipeline comercial vinculado a clientes, deficiencias y presupuestos.', links: [{ label: 'Clientes', to: '/app/clientes' }] },
  presupuestos: { title: 'Presupuestos', description: 'Presupuestos comerciales y técnicos pendientes de aprobación.', links: [{ label: 'Deficiencias valorables', to: '/app/deficiencias' }] },
  contratos: { title: 'Contratos', description: 'Contratos de mantenimiento y renovaciones.', links: [{ label: 'Clientes', to: '/app/clientes' }] },
  visitas: { title: 'Visitas', description: 'Visitas comerciales y técnicas planificadas.', links: [{ label: 'Calendario SAT', to: '/app/modulos/planificacion' }] },
  'informes-comerciales': { title: 'Informes comerciales', description: 'Indicadores comerciales específicos.', links: [{ label: 'Inicio comercial', to: '/app/inicio' }] },
  administracion: { title: 'Administración', description: 'Gestión administrativa interna.', links: [{ label: 'Documentos', to: '/app/documentos' }] },
  facturacion: { title: 'Facturación', description: 'Facturación y seguimiento administrativo de partes cerrados.', links: [{ label: 'Documentación', to: '/app/documentos' }] },
  cobros: { title: 'Cobros', description: 'Seguimiento de cobros y avisos administrativos.', links: [{ label: 'Avisos', to: '/app/avisos' }] },
  compras: { title: 'Compras', description: 'Solicitudes de material y compras.', links: [{ label: 'Documentos', to: '/app/documentos' }] },
  proveedores: { title: 'Proveedores', description: 'Gestión de proveedores y documentación asociada.', links: [{ label: 'Documentos', to: '/app/documentos' }] },
  prl: { title: 'PRL y personal', description: 'Prevención, documentación laboral y formación.', links: [{ label: 'Documentos', to: '/app/documentos' }] },
  vehiculos: { title: 'Vehículos', description: 'Flota, revisiones y documentación de vehículos.', links: [{ label: 'Documentos', to: '/app/documentos' }] },
  ventas: { title: 'Ventas', description: 'Indicadores de ventas y presupuestos aceptados.', links: [{ label: 'Gerencia', to: '/app/gerencia' }] },
  operaciones: { title: 'Operaciones', description: 'Visión ejecutiva de operaciones.', links: [{ label: 'Partes', to: '/app/partes' }] },
  rentabilidad: { title: 'Rentabilidad', description: 'Análisis de rentabilidad y desviaciones.', links: [{ label: 'Gerencia', to: '/app/gerencia' }] },
  personal: { title: 'Personal', description: 'Equipo humano, roles y carga de trabajo.', links: [{ label: 'Técnicos', to: '/app/modulos/tecnicos' }] },
  informes: { title: 'Informes', description: 'Informes de dirección e indicadores agregados.', links: [{ label: 'Métricas', to: '/app/gerencia' }] },
};

function NotFound() { return <section className="page"><Card title="Página no encontrada"><p className="large-note">La ruta no existe o no está disponible para este perfil.</p><Link className="primary" to="/app/inicio">Volver al inicio</Link></Card></section>; }

function GlobalSearch({ query, setQuery }: { query: string; setQuery: (value: string) => void }) { const navigate = useNavigate(); const { data } = useLoad(async () => query.trim() ? [...await clientsService.list(query), ...await equipmentService.list(query), ...await workOrdersService.list(query)] : [], [query], [] as any[]); return <div className="search-wrap"><label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, equipo, expediente, parte..." /></label>{query && <div className="search-results">{data.slice(0, 8).map((item) => { const route = item.legal_name ? `/app/clientes/${item.id}` : item.equipment_type_id ? `/app/equipos/${item.id}` : `/app/partes/${item.id}`; return <button key={`${route}-${item.id}`} onClick={() => { setQuery(''); navigate(route); }}><Badge tone="info">Resultado</Badge><span>{item.legal_name ?? item.code ?? item.title}</span><small>{item.trade_name ?? item.model ?? item.client_name ?? 'Registro Supabase'}</small></button>; })}{!data.length && <p>Sin resultados.</p>}</div>}</div>; }

function ClientForm({ title, initial, onClose, onSaved }: any) { const fields = [['legal_name','Razón social',true],['trade_name','Nombre comercial'],['tax_id','NIF'],['status','Estado'],['address','Dirección'],['city','Localidad'],['province','Provincia'],['postal_code','Código postal'],['country','País'],['phone','Teléfono'],['email','Correo'],['notes','Observaciones']]; return <EntityForm title={title} fields={fields} initial={{ status: 'Activo', country: 'Espana', ...initial }} help={!initial?.id ? 'El código de cliente se generará automáticamente al guardar.' : undefined} errorMessage="No se ha podido modificar el cliente." onClose={onClose} onSubmit={(values: any) => initial?.id ? clientsService.update(initial.id, values) : clientsService.create(values)} onSaved={onSaved} />; }
function ContactForm({ clientId, onClose, onSaved }: any) { return <EntityForm title="Añadir contacto" fields={[[ 'first_name','Nombre',true ],[ 'last_name','Apellidos' ],[ 'role','Cargo' ],[ 'email','Correo' ],[ 'phone','Teléfono' ],[ 'notes','Observaciones' ]]} onClose={onClose} onSubmit={(values: any) => clientsService.addContact(clientId, values)} onSaved={onSaved} />; }
function SiteForm({ title, initial, onClose, onSaved }: any) { const clients = useLoad(() => clientsService.list(), [], [] as any[]); return <EntityForm title={title} fields={[[ 'client_id','Cliente',true ],[ 'name','Nombre',true ],[ 'address','Dirección' ],[ 'city','Localidad' ],[ 'province','Provincia' ],[ 'postal_code','Código postal' ],[ 'country','País' ],[ 'schedule','Horario' ],[ 'notes','Observaciones' ]]} selects={{ client_id: clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` })) }} initial={{ country: 'Espana', ...initial }} help={!initial?.id ? 'El código de centro se generará automáticamente al guardar.' : undefined} onClose={onClose} onSubmit={(values: any) => initial?.id ? sitesService.update(initial.id, values) : sitesService.create(values)} onSaved={onSaved} />; }
function SiteContactForm({ siteId, onClose, onSaved }: any) { return <EntityForm title="Añadir contacto de centro" fields={[[ 'first_name','Nombre',true ],[ 'last_name','Apellidos' ],[ 'role','Cargo' ],[ 'email','Correo' ],[ 'phone','Teléfono' ]]} onClose={onClose} onSubmit={(values: any) => sitesService.addContact(siteId, values)} onSaved={onSaved} />; }
function EquipmentForm({ initial, onClose, onSaved }: any) { const clients = useLoad(() => clientsService.list(), [], [] as any[]); const sites = useLoad(() => sitesService.list(), [], [] as any[]); const types = useLoad(() => equipmentService.types(), [], [] as any[]); return <EntityForm title={initial?.id ? 'Modificar equipo' : 'Crear equipo'} fields={[[ 'client_id','Cliente',true ],[ 'site_id','Centro',true ],[ 'equipment_type_id','Tipo de equipo',true ],[ 'brand','Marca' ],[ 'model','Modelo' ],[ 'serial_number','Serie' ],[ 'installation_date','Fecha instalación' ],[ 'internal_location','Ubicación' ],[ 'status','Estado' ],[ 'criticality','Criticidad' ],[ 'notes','Observaciones' ]]} selects={{ client_id: clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` })), site_id: sites.data.filter((site) => !initial?.client_id || site.client_id === initial.client_id).map((site) => ({ value: site.id, label: `${site.code} · ${site.name}` })), equipment_type_id: types.data.map((type) => ({ value: type.id, label: type.name })) }} initial={{ status: 'Operativo', criticality: 'Media', ...initial }} help={!initial?.id ? 'El código de equipo se generará automáticamente al guardar.' : undefined} onClose={onClose} onSubmit={(values: any) => initial?.id ? equipmentService.update(initial.id, values) : equipmentService.create(values)} onSaved={onSaved} />; }
function ComponentForm({ equipmentId, onClose, onSaved }: any) { return <EntityForm title="Añadir componente" fields={[[ 'component_type','Tipo',true ],[ 'brand','Marca' ],[ 'model','Modelo' ],[ 'serial_number','Serie' ],[ 'status','Estado' ],[ 'notes','Observaciones' ]]} initial={{ status: 'Operativo' }} onClose={onClose} onSubmit={(values: any) => equipmentService.addComponent(equipmentId, values)} onSaved={onSaved} />; }
function CaseForm({ title, initial, onClose, onSaved }: any) { const clients = useLoad(() => clientsService.list(), [], [] as any[]); const sites = useLoad(() => sitesService.list(), [], [] as any[]); const fields = [[ 'title','Título',true ],[ 'description','Descripción' ],[ 'type','Tipo',true ],[ 'priority','Prioridad' ],[ 'status','Estado' ],[ 'client_id','Cliente',true ],[ 'site_id','Centro' ],[ 'origin','Origen',true ]]; return <EntityForm title={title} fields={fields} selects={{ client_id: clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` })), site_id: sites.data.filter((site) => !initial?.client_id || site.client_id === initial.client_id).map((site) => ({ value: site.id, label: `${site.code} · ${site.name}` })) }} initial={{ type: 'Averia', priority: 'Normal', status: 'Abierto', origin: 'SAT', ...initial }} help={!initial?.id ? 'El código de expediente se generará automáticamente al guardar.' : undefined} onClose={onClose} onSubmit={(values: any) => initial?.id ? casesService.update(initial.id, values) : casesService.create(values)} onSaved={onSaved} />; }

function CaseQuickCreate({ initial, onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>({ title: '', description: '', type: 'Averia', priority: 'Normal', status: 'Abierto', origin: 'SAT', ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try { onSaved(await casesService.create(values)); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido crear el expediente.'); }
    finally { setSaving(false); }
  };
  return <div className="nested-form"><h4>Crear expediente</h4><p className="large-note">El código se generará automáticamente al guardar.</p><label>Título<input value={values.title} onChange={(event) => set('title', event.target.value)} required /></label><label>Descripción<textarea value={values.description} onChange={(event) => set('description', event.target.value)} /></label><div className="form-grid"><FormSelect label="Tipo" value={values.type} onChange={(value) => set('type', value)} options={['Averia','Mantenimiento','Obra','Inspeccion','Garantia','Reclamacion','Mejora','Comercial'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Prioridad" value={values.priority} onChange={(value) => set('priority', value)} options={['Baja','Normal','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /></div>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar expediente</button><button type="button" className="primary" onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear y seleccionar'}</button></div></div>;
}
function WorkOrderForm({ initial, onClose, onSaved }: any) {
  const { workspace } = useAuth();
  const [values, setValues] = useState<Record<string, any>>({ type: 'Correctivo', priority: 'Normal', origin: workspaceToRole[workspace], scheduled_date: new Date().toISOString().slice(0, 10), ...initial });
  const [creatingCase, setCreatingCase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const clients = useLoad(() => clientsService.list(), [], [] as any[]);
  const sites = useLoad(() => sitesService.list(), [], [] as any[]);
  const equipment = useLoad(() => equipmentService.list(), [], [] as any[]);
  const cases = useLoad(() => casesService.list(), [], [] as any[]);
  const technicians = useLoad(() => profilesService.listTechnicians(), [], [] as any[]);
  const filteredSites = sites.data.filter((site) => !values.client_id || site.client_id === values.client_id);
  const filteredEquipment = equipment.data.filter((item) => (!values.client_id || item.client_id === values.client_id) && (!values.site_id || item.site_id === values.site_id));
  const filteredCases = cases.data.filter((item) => (!values.client_id || item.client_id === values.client_id) && (!values.site_id || !item.site_id || item.site_id === values.site_id) && !['Cerrado', 'Cancelado'].includes(item.status));
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...values, estimated_duration_minutes: values.estimated_duration_minutes ? Number(values.estimated_duration_minutes) : null };
      const result = initial?.id ? await workOrdersService.update(initial.id, payload) : await workOrdersService.create(payload, workspaceToRole[workspace]);
      onSaved?.(result?.id ?? result);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar el parte.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title={initial?.id ? 'Modificar parte' : 'Crear parte'} onClose={onClose} onSubmit={submit} saving={saving} error={error}><FormSelect label="Cliente" value={values.client_id} onChange={(value) => setValues((current) => ({ ...current, client_id: value, site_id: '', main_equipment_id: '', case_id: '' }))} required options={clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` }))} loading={clients.loading} /><FormSelect label="Centro" value={values.site_id} onChange={(value) => setValues((current) => ({ ...current, site_id: value, main_equipment_id: '', case_id: '' }))} required={filteredSites.length > 0} options={filteredSites.map((site) => ({ value: site.id, label: `${site.code} · ${site.name}` }))} loading={sites.loading} disabled={!values.client_id} /><FormSelect label="Equipo" value={values.main_equipment_id} onChange={(value) => set('main_equipment_id', value)} options={filteredEquipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.equipment_types?.name ?? item.model ?? 'Equipo'}` }))} loading={equipment.loading} disabled={!values.site_id} /><div className="field-with-action"><FormSelect label="Expediente" value={values.case_id} onChange={(value) => set('case_id', value)} options={filteredCases.map((item) => ({ value: item.id, label: `${item.code} · ${item.title} · ${displayStatus(item.type)} · ${displayStatus(item.status)}` }))} loading={cases.loading} disabled={!values.client_id} />{values.client_id && !cases.loading && !filteredCases.length && <p className="large-note">No hay expedientes activos para este cliente.</p>}<button type="button" onClick={() => setCreatingCase(true)} disabled={!values.client_id}>Crear expediente</button></div><div className="form-grid"><FormSelect label="Tipo" value={values.type} onChange={(value) => set('type', value)} required options={['Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Prioridad" value={values.priority} onChange={(value) => set('priority', value)} options={['Baja','Normal','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /></div><label>Título *<input value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} required /></label><label>Avería o descripción<textarea value={values.description ?? ''} onChange={(event) => set('description', event.target.value)} placeholder="Describe la avería, solicitud o trabajo previsto" /></label><div className="form-grid"><label>Fecha<input type="date" value={values.scheduled_date ?? ''} onChange={(event) => set('scheduled_date', event.target.value)} /></label><label>Hora<input type="time" value={values.scheduled_time ?? ''} onChange={(event) => set('scheduled_time', event.target.value)} /></label><label>Duración estimada (min)<input type="number" min="1" value={values.estimated_duration_minutes ?? ''} onChange={(event) => set('estimated_duration_minutes', event.target.value)} /></label><FormSelect label="Técnico" value={values.technician_id} onChange={(value) => set('technician_id', value)} options={technicians.data.map((row) => ({ value: row.id, label: fullName(row) }))} loading={technicians.loading} /></div><label>Material previsto<input value={values.planned_material ?? ''} onChange={(event) => set('planned_material', event.target.value)} /></label><label>Acceso / requisitos<input value={values.access_notes ?? ''} onChange={(event) => set('access_notes', event.target.value)} /></label><label>Observaciones<textarea value={values.notes ?? ''} onChange={(event) => set('notes', event.target.value)} /></label>{creatingCase && <CaseQuickCreate initial={{ client_id: values.client_id, site_id: values.site_id }} onClose={() => setCreatingCase(false)} onSaved={async (created: any) => { set('case_id', typeof created === 'string' ? created : created.id); setCreatingCase(false); await cases.reload(); }} />}</ModalForm>;
}
function AssignmentForm({ workOrderId, onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>({ assignment_date: new Date().toISOString().slice(0, 10), role: 'Principal' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const technicians = useLoad(() => profilesService.listTechnicians(), [], [] as any[]);
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try { await workOrdersService.assign(workOrderId, values.technician_id, values.assignment_date, values.planned_start_time || null, values.planned_end_time || null, values.role || 'Principal'); onSaved?.(); }
    catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido asignar el técnico.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title="Asignar técnico" onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel="Asignar técnico"><FormSelect label="Técnico" value={values.technician_id} onChange={(value) => set('technician_id', value)} required loading={technicians.loading} options={technicians.data.map((item) => ({ value: item.id, label: `${fullName(item)} · ${item.active ? 'Activo' : 'Inactivo'} · ${item.primary_area}` }))} /><div className="form-grid"><label>Fecha *<input type="date" value={values.assignment_date ?? ''} onChange={(event) => set('assignment_date', event.target.value)} required /></label><label>Hora inicio<input type="time" value={values.planned_start_time ?? ''} onChange={(event) => set('planned_start_time', event.target.value)} /></label><label>Hora fin<input type="time" value={values.planned_end_time ?? ''} onChange={(event) => set('planned_end_time', event.target.value)} /></label><FormSelect label="Rol" value={values.role} onChange={(value) => set('role', value)} options={['Principal','Apoyo'].map((value) => ({ value, label: value }))} /></div></ModalForm>;
}
function CheckForm({ initial, onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>({ status: 'Por realizar', global_result: 'Sin revisar', ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const workOrders = useLoad(() => workOrdersService.options(), [], [] as any[]);
  const equipment = useLoad(() => equipmentService.list(), [], [] as any[]);
  const selectedEquipment = equipment.data.find((item) => item.id === values.equipment_id);
  const templates = useLoad(() => checksService.templates(selectedEquipment?.equipment_type_id), [selectedEquipment?.equipment_type_id], [] as any[]);
  useEffect(() => { if (!templates.loading && templates.data.length === 1 && values.template_id !== templates.data[0].id) set('template_id', templates.data[0].id); if (!templates.loading && values.template_id && !templates.data.some((item) => item.id === values.template_id)) set('template_id', ''); }, [templates.loading, templates.data.length, values.template_id]);
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const selectWorkOrder = (workOrderId: string) => {
    const workOrder = workOrders.data.find((item) => item.id === workOrderId);
    setValues((current) => ({ ...current, work_order_id: workOrderId, equipment_id: workOrder?.main_equipment_id ?? current.equipment_id }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const result = initial?.id ? await checksService.update(initial.id, values) : await checksService.create(values);
      onSaved?.(result?.id ?? result);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar el check.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title={initial?.id ? 'Modificar check' : 'Crear check'} onClose={onClose} onSubmit={submit} saving={saving} error={error}><p className="large-note">El código de check se generará automáticamente al guardar. Solo se muestran plantillas compatibles con el tipo de equipo seleccionado.</p><FormSelect label="Parte relacionado" value={values.work_order_id} onChange={selectWorkOrder} options={workOrders.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.title}` }))} loading={workOrders.loading} /><FormSelect label="Equipo" value={values.equipment_id} onChange={(value) => setValues((current) => ({ ...current, equipment_id: value, template_id: '' }))} required options={equipment.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.equipment_types?.name ?? item.model ?? 'Equipo'}` }))} loading={equipment.loading} /><FormSelect label="Plantilla" value={values.template_id} onChange={(value) => set('template_id', value)} required options={templates.data.map((item) => ({ value: item.id, label: `${item.name} · v${item.version}` }))} loading={templates.loading} disabled={!values.equipment_id} />{values.equipment_id && !templates.loading && !templates.data.length && <p className="form-error">No hay una plantilla compatible activa para este tipo de equipo.</p>}<FormSelect label="Estado" value={values.status} onChange={(value) => set('status', value)} options={['Por realizar','En curso','Realizado','Cancelado'].map((value) => ({ value, label: value }))} /><FormSelect label="Resultado global" value={values.global_result} onChange={(value) => set('global_result', value)} options={['Sin revisar','Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable'].map((value) => ({ value, label: displayStatus(value) }))} /><label>Observaciones<textarea value={values.observations ?? ''} onChange={(event) => set('observations', event.target.value)} /></label></ModalForm>;
}
function DocumentForm({ onClose, onSaved }: any) { return <EntityForm title="Crear documento" fields={[[ 'title','Título',true ],[ 'type','Tipo',true ],[ 'version','Versión' ],[ 'document_date','Fecha' ],[ 'origin','Origen' ],[ 'url','URL' ],[ 'observations','Observaciones' ]]} initial={{ type: 'Ficha tecnica' }} onClose={onClose} onSubmit={(values: any) => documentsService.create(values)} onSaved={onSaved} />; }

function AlertForm({ onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>({ type: 'Operativo', priority: 'Normal', status: 'Abierto', alert_date: new Date().toISOString().slice(0, 10), recipient_role: 'SAT' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const profiles = useLoad(() => profilesService.listActive(), [], [] as any[]);
  const clients = useLoad(() => clientsService.list(), [], [] as any[]);
  const sites = useLoad(() => sitesService.list(), [], [] as any[]);
  const equipment = useLoad(() => equipmentService.list(), [], [] as any[]);
  const cases = useLoad(() => casesService.list(), [], [] as any[]);
  const workOrders = useLoad(() => workOrdersService.options(), [], [] as any[]);
  const checks = useLoad(() => checksService.list(), [], [] as any[]);
  const deficiencies = useLoad(() => deficienciesService.list(), [], [] as any[]);
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const related = (() => {
    if (values.deficiency_id) return ['deficiencies', values.deficiency_id];
    if (values.check_id) return ['checks', values.check_id];
    if (values.work_order_id) return ['work_orders', values.work_order_id];
    if (values.case_id) return ['cases', values.case_id];
    if (values.equipment_id) return ['equipment', values.equipment_id];
    if (values.site_id) return ['sites', values.site_id];
    if (values.client_id) return ['clients', values.client_id];
    return [null, null];
  })();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const due = values.due_date ? `\nFecha límite: ${values.due_date}` : '';
      await alertsService.create({ title: values.title, description: `${values.description ?? ''}${due}`, type: values.type, priority: values.priority, status: values.status, alert_date: values.alert_date ? new Date(values.alert_date).toISOString() : new Date().toISOString(), related_entity: related[0], related_id: related[1] }, [{ role: values.recipient_role || undefined, profile_id: values.recipient_profile_id || undefined }]);
      onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido crear el aviso.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title="Crear aviso" onClose={onClose} onSubmit={submit} saving={saving} error={error}><label>Título *<input value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} required /></label><label>Descripción *<textarea value={values.description ?? ''} onChange={(event) => set('description', event.target.value)} required /></label><div className="form-grid"><FormSelect label="Tipo" value={values.type} onChange={(value) => set('type', value)} options={['Operativo','Tecnico','Comercial','Administrativo','PRL','Material','Documentacion','Critico'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Prioridad" value={values.priority} onChange={(value) => set('priority', value)} options={['Baja','Normal','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Estado inicial" value={values.status} onChange={(value) => set('status', value)} options={['Abierto','En curso','Cerrado','Cancelado'].map((value) => ({ value, label: value }))} /><label>Fecha<input type="date" value={values.alert_date ?? ''} onChange={(event) => set('alert_date', event.target.value)} /></label><label>Fecha límite opcional<input type="date" value={values.due_date ?? ''} onChange={(event) => set('due_date', event.target.value)} /></label><FormSelect label="Rol destinatario" value={values.recipient_role} onChange={(value) => set('recipient_role', value)} options={['SAT','Comercial','Oficina','Gerencia','Tecnico'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Destinatario concreto" value={values.recipient_profile_id} onChange={(value) => set('recipient_profile_id', value)} options={profiles.data.map((item) => ({ value: item.id, label: `${fullName(item)} · ${item.primary_area}` }))} loading={profiles.loading} /></div><Card title="Registro relacionado opcional"><div className="form-grid"><FormSelect label="Cliente" value={values.client_id} onChange={(value) => set('client_id', value)} options={clients.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.legal_name}` }))} loading={clients.loading} /><FormSelect label="Centro" value={values.site_id} onChange={(value) => set('site_id', value)} options={sites.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} loading={sites.loading} /><FormSelect label="Equipo" value={values.equipment_id} onChange={(value) => set('equipment_id', value)} options={equipment.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.equipment_types?.name ?? item.model ?? 'Equipo'}` }))} loading={equipment.loading} /><FormSelect label="Expediente" value={values.case_id} onChange={(value) => set('case_id', value)} options={cases.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.title}` }))} loading={cases.loading} /><FormSelect label="Parte" value={values.work_order_id} onChange={(value) => set('work_order_id', value)} options={workOrders.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.title}` }))} loading={workOrders.loading} /><FormSelect label="Check" value={values.check_id} onChange={(value) => set('check_id', value)} options={checks.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.equipment?.code ?? 'Equipo'}` }))} loading={checks.loading} /><FormSelect label="Deficiencia" value={values.deficiency_id} onChange={(value) => set('deficiency_id', value)} options={deficiencies.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.description}` }))} loading={deficiencies.loading} /></div></Card></ModalForm>;
}

function useOverlayScrollLock() {
  useEffect(() => {
    const scrollY = window.scrollY;
    const previous = { position: document.body.style.position, top: document.body.style.top, width: document.body.style.width, overflow: document.body.style.overflow };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = previous.position;
      document.body.style.top = previous.top;
      document.body.style.width = previous.width;
      document.body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);
}

function ModalForm({ title, onClose, onSubmit, saving, error, children, submitLabel }: any) {
  useOverlayScrollLock();
  return <div className="mini-modal" role="dialog" aria-modal="true" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}><form onSubmit={onSubmit}><h3>{title}</h3>{children}{error && <p className="form-error"><AlertTriangle size={16} />{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Guardando...' : (submitLabel ?? title)}</button></div></form></div>;
}

function FormSelect({ label, value, onChange, options, required, loading, disabled }: { label: string; value?: string; onChange: (value: string) => void; options: { value: string; label: string }[]; required?: boolean; loading?: boolean; disabled?: boolean }) {
  return <label>{label}{required ? ' *' : ''}<select value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled || loading}><option value="">{loading ? 'Cargando...' : 'Seleccionar'}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function EntityForm({ title, fields, initial = {}, selects = {}, help, errorMessage, onClose, onSubmit, onSaved }: any) { useOverlayScrollLock(); const [values, setValues] = useState<Record<string, any>>(initial); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { const result = await onSubmit(values); onSaved?.(result?.id ?? result); } catch (err) { console.error(err); setError(errorMessage ?? (err instanceof Error ? err.message : 'Error al guardar')); } finally { setSaving(false); } }; return <div className="mini-modal" role="dialog" aria-modal="true" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}><form onSubmit={submit}><h3>{title}</h3>{help && <p className="large-note">{help}</p>}{fields.map(([key, label, required]: any[]) => selects[key] ? <FormSelect key={key} label={label} value={values[key]} onChange={(value) => setValues({ ...values, [key]: value })} required={Boolean(required)} options={selects[key]} /> : <label key={key}>{label}{required ? ' *' : ''}<input value={values[key] ?? ''} onChange={(event) => setValues({ ...values, [key]: event.target.value })} required={Boolean(required)} /></label>)}{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Guardando...' : title}</button></div></form></div>; }

function ListPage({ title, summary, search, setSearch, action, loading, error, retry, empty, children }: any) { return <section className="page"><Breadcrumb items={['Listado', title]} /><div className="page-head"><div><h2>{title}</h2><p>{summary}</p></div>{action}</div><div className="filters local-filters"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Buscar en ${title.toLowerCase()}...`} /></label></div><StateBlock loading={loading} error={error} retry={retry} empty={empty}>{children}</StateBlock></section>; }
function StateBlock({ loading, error, retry, empty, children }: any) { if (loading) return <Card title="Cargando"><p className="large-note">Consultando Supabase...</p></Card>; if (error) return <Card title="Error"><p className="form-error">{error}</p><button className="primary" onClick={retry}>Reintentar</button></Card>; if (empty) return <Card title="Sin registros"><p className="large-note">No hay datos para este filtro.</p>{retry && <button onClick={retry}>Reintentar</button>}</Card>; return <>{children}</>; }
function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) { return <section className="card"><header><h3>{title}</h3>{action}</header>{children}</section>; }
function Badge({ tone, children }: { tone: Severity; children: ReactNode }) { return <span className={`badge ${tone}`}>{typeof children === 'string' ? visibleLabel(children) : children}</span>; }
function InfoGrid({ items }: { items: [string, any][] }) { return <dl className="info-grid">{items.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value ?? '-')}</dd></div>)}</dl>; }
function CompactRows({ rows, empty }: { rows: [string, string, Severity, string][]; empty: string }) { if (!rows.length) return <p className="large-note">{empty}</p>; return <div className="compact-list">{rows.map(([title, text, tone, route]) => <article key={`${title}-${text}`}><Badge tone={tone}>{title}</Badge><p>{text}</p><Link to={route}>Abrir</Link></article>)}</div>; }
function WorkTable({ rows, columns, route }: { rows: any[]; columns: string[]; route: string }) { return <div className="table-card"><table><thead><tr>{columns.map((column) => <th key={column}>{column.split('.').at(-1)}</th>)}<th>Acción</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{columns.map((column) => <td key={column}>{displayStatus(String(readPath(row, column) ?? '-'))}</td>)}<td><Link to={`${route}/${row.id}`}>Abrir</Link></td></tr>)}</tbody></table></div>; }
function Breadcrumb({ items }: { items: string[] }) { return <div className="breadcrumb">{items.map((item, index) => <span key={item}>{index > 0 && '/'} {item}</span>)}</div>; }
function BackButton() { const navigate = useNavigate(); return <button className="link-button" onClick={() => navigate(-1)}><ChevronLeft size={16} /> Volver</button>; }
function Hero({ title, subtitle, tone }: { title: string; subtitle: string; tone: Severity }) { return <div className="detail-hero"><div><p className="eyebrow">Ficha</p><h2>{title}</h2><p>{subtitle}</p></div><Badge tone={tone}>{tone}</Badge></div>; }
function Timeline({ items }: { items: string[] }) { return items.length ? <ol className="timeline">{items.map((item) => <li key={item}>{item}</li>)}</ol> : <p className="large-note">Sin eventos.</p>; }
function Related({ title, groups }: { title: string; groups: [string, any[] | undefined, string][] }) { return <Card title={title}><div className="grid half">{groups.map(([label, rows, base]) => <Card key={label} title={label}><CompactRows rows={(rows ?? []).filter(Boolean).map((row: any) => [row.code ?? row.title ?? row.name ?? row.related_type ?? row.id, row.legal_name ?? row.description ?? row.status ?? row.related_id ?? 'Registro vinculado', severityForStatus(row.status), `${base}/${row.id ?? ''}`])} empty={`Sin ${label.toLowerCase()}.`} /></Card>)}</div></Card>; }
function SidePanel({ title, subtitle, onClose, children }: any) { useOverlayScrollLock(); useEffect(() => { const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [onClose]); return <div className="overlay" role="dialog" aria-modal="true" onMouseDown={onClose} onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}><aside className="side-panel" onMouseDown={(event) => event.stopPropagation()}><header><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><button onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>{children}</aside></div>; }
function ConfirmModal({ title, text, onCancel, onConfirm }: any) { return <div className="mini-modal"><div><h3>{title}</h3><p>{text}</p><div className="modal-footer"><button onClick={onCancel}>Cancelar</button><button className="primary" onClick={onConfirm}>Confirmar</button></div></div></div>; }
function metric(title: string, text: string, tone: Severity, route: string, icon: ReactNode) { return { title, text, tone, route, icon }; }
function readPath(row: any, path: string) { return path.split('.').reduce((value, key) => value?.[key], row); }
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function routeForAlert(alert: any) { if (!alert?.related_entity || !alert?.related_id) return '/app/avisos'; const map: Record<string, string> = { work_orders: '/app/partes', deficiencies: '/app/deficiencias', equipment: '/app/equipos', checks: '/app/checks', clients: '/app/clientes', sites: '/app/centros', cases: '/app/expedientes' }; return `${map[alert.related_entity] ?? '/app/avisos'}/${alert.related_id}`; }

export default App;
