import { createContext, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent, type ReactNode } from 'react';
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
import { superadminService } from './services/superadminService';
import { searchService } from './services/searchService';
import { checkProblemStatuses, checkStatuses, sectionalZones, type CheckBlockId } from './checks/sectionalZones';
import { buildFunctionalCheckBlocks, equipmentTypeName, isUuid, remoteBlockState, templateTypeMismatch, visualTemplateForEquipment } from './checks/checkBlocks';
import { technicianOfflineService } from './services/technicianOfflineService';
import { canAccessModule, canAccessRoute, canAssignTechnician, canCreateAlert, canCreateCheck, canCreateWorkOrder, canEditWorkOrder, canExecuteCheck, canExecuteWorkOrder, canManageCheck, canRole, canViewCheck, canViewWorkOrder, isSuperadmin, normalizedRoleNames, profileWorkspaces } from './auth/permissions';
import { loadInitialAuthSnapshot, loginAuthState, protectedAuthState } from './auth/sessionBootstrap';
import { displayStatus, formatDate, fullName, initials, nextWorkOrderStatus, previousWorkOrderStatus, severityForPriority, severityForStatus, visibleLabel, workspaceTitles, workspaceToRole } from './shared/labels';
import { deficiencyFiltersFromParams, isOpenDeficiencyStatus, normalizeParam, workOrderFilterFromParams } from './shared/filters';
import { canvasHasInk, fileToLocalPhoto } from './shared/offlineMedia';
import { activityTimeline, interventionSummary, maskDocument } from './shared/workOrderPresentation';
import type { Profile, RoleName, Severity, Workspace } from './shared/types';

type AuthContextValue = { initialized: boolean; session: Session | null; profile: Profile | null; profileError: string | null; workspace: Workspace; setWorkspace: (workspace: Workspace) => void; refreshProfile: () => Promise<void>; signOut: () => Promise<void> };
type SuperadminScopeContextValue = { companyId: string | null; setCompanyId: (companyId: string | null) => void };
type LoadState<T> = { data: T; loading: boolean; error: string };

const AuthContext = createContext<AuthContextValue | null>(null);
const SuperadminScopeContext = createContext<SuperadminScopeContextValue | null>(null);
const sidebarKey = 'dmp-sidebar-collapsed';
const workspaceKey = 'dmp-workspace';
const superadminCompanyKey = 'dmp-superadmin-company-scope';
const iconProps = { size: 18, strokeWidth: 2 };

function App() {
  return <BrowserRouter><AuthProvider><SuperadminScopeProvider><Routes><Route path="/" element={<LoginPage />} /><Route element={<ProtectedLayout />}><Route path="/app/inicio" element={<HomePage />} /><Route path="/app/superadmin" element={<SuperadminGuard><SuperadminHome /></SuperadminGuard>} /><Route path="/app/superadmin/usuarios" element={<SuperadminGuard><SuperadminUsers /></SuperadminGuard>} /><Route path="/app/superadmin/roles" element={<SuperadminGuard><SuperadminRoles /></SuperadminGuard>} /><Route path="/app/superadmin/plantillas" element={<SuperadminGuard><SuperadminTemplates /></SuperadminGuard>} /><Route path="/app/superadmin/sincronizacion" element={<SuperadminGuard><SuperadminSync /></SuperadminGuard>} /><Route path="/app/superadmin/auditoria" element={<SuperadminGuard><SuperadminAudit /></SuperadminGuard>} /><Route path="/app/clientes" element={<ClientsPage />} /><Route path="/app/clientes/:id" element={<ClientDetailPage />} /><Route path="/app/centros" element={<SitesPage />} /><Route path="/app/centros/:id" element={<SiteDetailPage />} /><Route path="/app/equipos" element={<EquipmentPage />} /><Route path="/app/equipos/:id" element={<EquipmentDetailPage />} /><Route path="/app/expedientes" element={<CasesPage />} /><Route path="/app/expedientes/:id" element={<CaseDetailPage />} /><Route path="/app/partes" element={<WorkOrdersPage />} /><Route path="/app/trabajos" element={<Navigate to="/app/partes" replace />} /><Route path="/app/trabajos/:id" element={<WorkOrderDetailPageV2 />} /><Route path="/app/partes/:id" element={<WorkOrderDetailPageV2 />} /><Route path="/app/tecnico" element={<TechnicianDayPage />} /><Route path="/app/tecnico/trabajo/:id" element={<TechnicianWorkPage />} /><Route path="/app/pendientes" element={<PendingSyncPage />} /><Route path="/app/checks" element={<ChecksPage />} /><Route path="/app/checks/:id" element={<CheckDetailPage />} /><Route path="/app/checks/:id/bloque/:blockId" element={<CheckBlockPageV2 />} /><Route path="/app/deficiencias" element={<DeficienciesPage />} /><Route path="/app/deficiencias/:id" element={<DeficiencyDetailPage />} /><Route path="/app/avisos" element={<AlertsPage />} /><Route path="/app/documentos" element={<DocumentsPage />} /><Route path="/app/documentos/:id" element={<DocumentDetailPage />} /><Route path="/app/gerencia" element={<ManagementPage />} /><Route path="/app/modulos/tecnicos/:profileId" element={<OperationalProfileRoute role="Tecnico" />} /><Route path="/app/modulos/comerciales/:profileId" element={<OperationalProfileRoute role="Comercial" />} /><Route path="/app/modulos/:moduleId" element={<ModulePage />} /><Route path="/app/*" element={<NotFound />} /></Route><Route path="*" element={<NotFound />} /></Routes></SuperadminScopeProvider></AuthProvider></BrowserRouter>;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [workspace, setWorkspaceState] = useState<Workspace>(() => (localStorage.getItem(workspaceKey) as Workspace | null) ?? 'sat');
  const authRequestId = useRef(0);

  const applyProfile = (nextProfile: Profile | null) => {
    setProfile(nextProfile);
    if (!nextProfile) return;
    const saved = localStorage.getItem(workspaceKey) as Workspace | null;
    const allowedWorkspaces = profileWorkspaces(nextProfile);
    const allowed = saved && allowedWorkspaces.includes(saved) ? saved : allowedWorkspaces[0] ?? 'sat';
    localStorage.setItem(workspaceKey, allowed);
    setWorkspaceState(allowed);
  };

  const refreshProfile = async () => {
    const requestId = ++authRequestId.current;
    const snapshot = await loadInitialAuthSnapshot(() => authService.getSession(), () => profilesService.getCurrentProfile());
    if (requestId !== authRequestId.current) return;
    setSession(snapshot.session);
    setProfileError(snapshot.profileError);
    applyProfile(snapshot.profile);
    setInitialized(true);
  };

  useEffect(() => {
    let mounted = true;
    refreshProfile().catch(() => {
      if (!mounted) return;
      setSession(null);
      setProfile(null);
      setProfileError(null);
      setInitialized(true);
    });
    const { data } = authService.onAuthStateChange(async (_event, nextSession) => {
      if (!mounted) return;
      if (_event === 'INITIAL_SESSION') return;
      const requestId = ++authRequestId.current;
      setSession(nextSession);
      if (!nextSession) { setProfile(null); setProfileError(null); setInitialized(true); return; }
      try {
        const nextProfile = await profilesService.getCurrentProfile();
        if (!mounted || requestId !== authRequestId.current) return;
        setProfileError(null);
        applyProfile(nextProfile);
        setInitialized(true);
      } catch {
        if (!mounted || requestId !== authRequestId.current) return;
        setProfile(null);
        setProfileError('La sesión existe, pero no hay perfil activo enlazado a este usuario Auth.');
        setInitialized(true);
      }
    });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const setWorkspace = (next: Workspace) => { localStorage.setItem(workspaceKey, next); setWorkspaceState(next); };
  const signOut = async () => { await authService.signOut(); localStorage.removeItem(workspaceKey); setSession(null); setProfile(null); setProfileError(null); setInitialized(true); };
  const value = useMemo(() => ({ initialized, session, profile, profileError, workspace, setWorkspace, refreshProfile, signOut }), [initialized, session, profile, profileError, workspace]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('AuthContext no disponible'); return value; }

function AuthLoadingScreen() {
  return <main className="page"><Card title="Restaurando sesión"><p className="large-note">Comprobando la sesión activa antes de abrir la ruta solicitada.</p></Card></main>;
}

function SuperadminScopeProvider({ children }: { children: ReactNode }) {
  const [companyId, setCompanyIdState] = useState<string | null>(() => localStorage.getItem(superadminCompanyKey) || null);
  const setCompanyId = (next: string | null) => {
    if (next) localStorage.setItem(superadminCompanyKey, next);
    else localStorage.removeItem(superadminCompanyKey);
    setCompanyIdState(next);
  };
  return <SuperadminScopeContext.Provider value={{ companyId, setCompanyId }}>{children}</SuperadminScopeContext.Provider>;
}

function useSuperadminScope() {
  const value = useContext(SuperadminScopeContext);
  if (!value) throw new Error('SuperadminScopeContext no disponible');
  return value;
}

function LoginPage() {
  const { initialized, session, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (loginAuthState({ initialized, session, profile, profileError: null }) === 'redirect-app' && profile) navigate(isSuperadmin(profile) ? '/app/superadmin' : profile.primary_area === 'Tecnico' ? '/app/tecnico' : '/app/inicio', { replace: true }); }, [initialized, session, profile, navigate]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true); setError('');
    const { error: signError } = await authService.signIn(email, password);
    if (signError) { console.error(signError); setError('Correo o contraseña incorrectos.'); setLoading(false); return; }
    try { await refreshProfile(); } catch (err) { console.error(err); setError('Correo o contraseña incorrectos.'); await authService.signOut(); }
    setLoading(false);
  };

  if (!initialized) return <AuthLoadingScreen />;
  return <main className="login-page"><section className="login-visual" aria-hidden="true"><div className="industrial-mark"><Factory size={42} /><span>DMP</span></div><div className="door-illustration"><span /><span /><span /><i /></div><h1>DoorManager Pro</h1><p>Operaciones, mantenimiento, SAT y gestión empresarial sobre un mismo núcleo de información.</p><div className="visual-tags"><Badge tone="maintenance">SAT</Badge><Badge tone="commercial">Comercial</Badge><Badge tone="info">Dirección</Badge></div></section><form className="login-card" aria-label="Acceso a DoorManager Pro" onSubmit={submit}><div className="login-brand"><Factory size={30} /><div><strong>DoorManager Pro</strong><span>Acceso privado conectado a Supabase</span></div></div><label>Correo<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" autoComplete="username" required /></label><label>Contraseña<div className="password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Contraseña" autoComplete="current-password" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>{error && <p className="form-error"><AlertTriangle size={16} />{error}</p>}<button className="primary wide big" disabled={loading}>{loading ? 'Iniciando sesión...' : 'Iniciar sesión'}</button><footer>Las credenciales no se publican en la interfaz ni en el repositorio.</footer></form></main>;
}

function ProtectedLayout() {
  const { initialized, session, profile, profileError, workspace, setWorkspace, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 760 || localStorage.getItem(sidebarKey) === 'true');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);
  const nav = navForWorkspace(workspace).filter((item) => canAccessModule(profile, workspace, item.id));
  const active = nav.find((item) => location.pathname.startsWith(item.path)) ?? nav[0];

  useEffect(() => { setAlertsOpen(false); setUserOpen(false); setQuery(''); if (window.innerWidth <= 760) setCollapsed(true); }, [location.pathname, workspace]);
  useEffect(() => {
    const loadUnread = () => { if (profile) alertsService.unread().then((rows) => setUnread(rows.length)).catch(() => setUnread(0)); };
    loadUnread();
    window.addEventListener('dmp-alerts-changed', loadUnread);
    return () => window.removeEventListener('dmp-alerts-changed', loadUnread);
  }, [profile, location.pathname]);

  const allowedWorkspaces = profileWorkspaces(profile);
  useEffect(() => { if (profile && allowedWorkspaces.length && !allowedWorkspaces.includes(workspace)) setWorkspace(allowedWorkspaces[0]); }, [profile?.id, workspace, allowedWorkspaces.join('|')]);

  const authState = protectedAuthState({ initialized, session, profile, profileError });
  if (authState === 'loading') return <AuthLoadingScreen />;
  if (authState === 'redirect-login') return <Navigate to="/" replace />;
  if (authState === 'profile-error') return <main className="page"><Card title="Perfil no enlazado"><p className="form-error">{profileError ?? 'La sesión existe, pero no hay perfil activo enlazado a este usuario Auth.'}</p><button className="primary" onClick={() => signOut()}>Cerrar sesión</button></Card></main>;
  if (!profile) return <main className="page"><Card title="Perfil no enlazado"><p className="form-error">La sesión existe, pero no hay perfil activo enlazado a este usuario Auth.</p><button className="primary" onClick={() => signOut()}>Cerrar sesión</button></Card></main>;
  if (!allowedWorkspaces.length) return <main className="page"><Card title="Perfil sin rol válido"><p className="form-error">Tu perfil no tiene un rol válido. Contacta con el administrador.</p><button className="primary" onClick={() => signOut()}>Cerrar sesión</button></Card></main>;
  if (isSuperadmin(profile) && !location.pathname.startsWith('/app/superadmin')) return <Navigate to="/app/superadmin" replace />;
  if (!canAccessRoute(profile, location.pathname)) return <main><AccessDeniedZone /></main>;

  const toggleSidebar = () => { localStorage.setItem(sidebarKey, String(!collapsed)); setCollapsed(!collapsed); };
  const doSignOut = async () => { const pending = workspace === 'tecnico' ? await technicianOfflineService.pending() : []; if (pending.length && !window.confirm(`Hay ${pending.length} cambios técnicos pendientes de sincronizar. Si sales, seguirán guardados en este dispositivo. Acepta para salir o cancela para revisar pendientes.`)) { navigate('/app/pendientes'); return; } setAlertsOpen(false); await signOut(); navigate('/', { replace: true }); };

  return <div className="shell"><aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}><div className="brand-row"><Link className="brand" to={workspace === 'tecnico' ? '/app/tecnico' : '/app/inicio'}><Factory {...iconProps} /><span>DoorManager</span></Link><button className="side-toggle" onClick={toggleSidebar} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>{collapsed ? <PanelLeftOpen {...iconProps} /> : <PanelLeftClose {...iconProps} />}</button></div><nav>{nav.map((item) => { const Icon = item.icon; return <Link key={item.id} className={active?.id === item.id ? 'active' : ''} to={item.path}><Icon {...iconProps} /><span>{item.label}</span></Link>; })}</nav></aside><div className="workspace"><header className="topbar"><button className="mobile-menu" onClick={toggleSidebar} title="Menú"><Menu {...iconProps} /></button><div className="top-title"><p className="eyebrow">{workspaceTitles[workspace]}</p><h1>{active?.label ?? 'DoorManager Pro'}</h1></div><GlobalSearch query={query} setQuery={setQuery} /><button className="icon-btn" onClick={() => setAlertsOpen(true)} title="Centro de avisos" aria-label="Abrir centro de avisos"><Bell {...iconProps} /><b>{unread}</b></button><div className="user-menu-wrap"><button className="user user-button" onClick={() => setUserOpen(!userOpen)}><span>{initials(fullName(profile))}</span><div><strong>{fullName(profile)}</strong><small>{profile.primary_area}</small></div></button>{userOpen && <><button className="popover-backdrop" aria-label="Cerrar menú" onClick={() => setUserOpen(false)} /><div className="user-popover" role="menu"><button disabled><UserRound size={16} /> Mi perfil</button>{allowedWorkspaces.length > 1 && <div className="workspace-switch"><strong>Cambiar espacio de trabajo</strong>{allowedWorkspaces.map((item) => <button key={item} className={workspace === item ? 'active' : ''} onClick={() => { setWorkspace(item); navigate(item === 'tecnico' ? '/app/tecnico' : '/app/inicio'); }}>{workspaceTitles[item]}</button>)}</div>}<button disabled><Settings size={16} /> Preferencias locales</button><button onClick={doSignOut}><LogOut size={16} /> Cerrar sesión</button></div></>}</div><div className="mobile-session-actions"><button onClick={doSignOut}><LogOut size={16} /> Salir</button></div></header><main><Outlet /></main></div>{alertsOpen && <SidePanel title="Centro de avisos" subtitle={workspaceTitles[workspace]} onClose={() => setAlertsOpen(false)}><AlertsPanel onClose={() => setAlertsOpen(false)} /></SidePanel>}</div>;
}

function navForWorkspace(workspace: Workspace) {
  const superadmin = [{ id: 'inicio', label: 'Inicio', path: '/app/superadmin', icon: ShieldAlert }, { id: 'usuarios', label: 'Usuarios', path: '/app/superadmin/usuarios', icon: UsersRound }, { id: 'crear-usuario', label: 'Crear usuario', path: '/app/superadmin/usuarios/nuevo', icon: UserRound }, { id: 'roles', label: 'Roles y permisos', path: '/app/superadmin/roles', icon: Settings }, { id: 'clientes', label: 'Clientes', path: '/app/superadmin/clientes', icon: Building2 }, { id: 'centros', label: 'Centros', path: '/app/superadmin/centros', icon: Factory }, { id: 'equipos', label: 'Equipos', path: '/app/superadmin/equipos', icon: Warehouse }, { id: 'partes', label: 'Partes', path: '/app/superadmin/partes', icon: ClipboardList }, { id: 'checks', label: 'Checks', path: '/app/superadmin/checks', icon: ClipboardCheck }, { id: 'plantillas', label: 'Plantillas de checks', path: '/app/superadmin/plantillas', icon: PackageCheck }, { id: 'sincronizacion', label: 'Sincronización', path: '/app/superadmin/sincronizacion', icon: Truck }, { id: 'auditoria', label: 'Auditoría', path: '/app/superadmin/auditoria', icon: FileText }, { id: 'configuracion', label: 'Configuración', path: '/app/superadmin/configuracion', icon: Settings }];
  const sat = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'planificacion', label: 'Planificación', path: '/app/modulos/planificacion', icon: CalendarClock }, { id: 'tecnicos', label: 'Técnicos', path: '/app/modulos/tecnicos', icon: UsersRound }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'centros', label: 'Centros', path: '/app/centros', icon: Factory }, { id: 'equipos', label: 'Equipos', path: '/app/equipos', icon: Warehouse }, { id: 'expedientes', label: 'Expedientes', path: '/app/expedientes', icon: FileText }, { id: 'partes', label: 'Partes', path: '/app/partes', icon: ClipboardList }, { id: 'checks', label: 'Checks', path: '/app/checks', icon: ClipboardCheck }, { id: 'deficiencias', label: 'Deficiencias', path: '/app/deficiencias', icon: ShieldAlert }, { id: 'documentos', label: 'Documentación', path: '/app/documentos', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }, { id: 'plantillas', label: 'Plantillas', path: '/app/plantillas', icon: PackageCheck }];
  const comercial = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'comerciales', label: 'Comerciales', path: '/app/modulos/comerciales', icon: BriefcaseBusiness }, { id: 'oportunidades', label: 'Oportunidades', path: '/app/modulos/oportunidades', icon: BriefcaseBusiness }, { id: 'presupuestos', label: 'Presupuestos', path: '/app/modulos/presupuestos', icon: FileText }, { id: 'contratos', label: 'Contratos', path: '/app/modulos/contratos', icon: ClipboardList }, { id: 'visitas', label: 'Visitas', path: '/app/modulos/visitas', icon: CalendarClock }, { id: 'expedientes', label: 'Expedientes', path: '/app/expedientes', icon: FileText }, { id: 'partes', label: 'Partes', path: '/app/partes', icon: ClipboardList }, { id: 'informes', label: 'Informes comerciales', path: '/app/modulos/informes-comerciales', icon: PieChart }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  const oficina = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'administracion', label: 'Administración', path: '/app/modulos/administracion', icon: ClipboardCheck }, { id: 'facturacion', label: 'Facturación', path: '/app/modulos/facturacion', icon: FileText }, { id: 'cobros', label: 'Cobros', path: '/app/modulos/cobros', icon: Bell }, { id: 'compras', label: 'Compras', path: '/app/modulos/compras', icon: Truck }, { id: 'proveedores', label: 'Proveedores', path: '/app/modulos/proveedores', icon: Warehouse }, { id: 'prl', label: 'PRL y personal', path: '/app/modulos/prl', icon: ShieldAlert }, { id: 'vehiculos', label: 'Vehículos', path: '/app/modulos/vehiculos', icon: Truck }, { id: 'documentos', label: 'Documentos', path: '/app/documentos', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  const gerencia = [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'resumen', label: 'Resumen', path: '/app/gerencia', icon: PieChart }, { id: 'ventas', label: 'Ventas', path: '/app/modulos/ventas', icon: BriefcaseBusiness }, { id: 'operaciones', label: 'Operaciones', path: '/app/modulos/operaciones', icon: Gauge }, { id: 'rentabilidad', label: 'Rentabilidad', path: '/app/modulos/rentabilidad', icon: PieChart }, { id: 'calidad', label: 'Calidad', path: '/app/deficiencias', icon: ShieldAlert }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'tecnicos', label: 'Técnicos', path: '/app/modulos/tecnicos', icon: UsersRound }, { id: 'comerciales', label: 'Comerciales', path: '/app/modulos/comerciales', icon: BriefcaseBusiness }, { id: 'personal', label: 'Personal', path: '/app/modulos/personal', icon: UsersRound }, { id: 'informes', label: 'Informes', path: '/app/modulos/informes', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  if (workspace === 'superadmin') return superadmin;
  if (workspace === 'tecnico') return [{ id: 'jornada', label: 'Mi jornada', path: '/app/tecnico', icon: CalendarClock }, { id: 'checks', label: 'Checks', path: '/app/checks', icon: ClipboardCheck }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }];
  if (workspace === 'sat') return sat;
  if (workspace === 'comercial') return comercial;
  if (workspace === 'oficina') return oficina;
  return gerencia;
}

function homeForWorkspace(workspace: Workspace) {
  if (workspace === 'tecnico') return '/app/tecnico';
  if (workspace === 'superadmin') return '/app/superadmin';
  return '/app/inicio';
}

function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = [], empty: T) {
  const [state, setState] = useState<LoadState<T>>({ data: empty, loading: true, error: '' });
  const reload = async () => { setState((prev) => ({ ...prev, loading: true, error: '' })); try { setState({ data: await loader(), loading: false, error: '' }); } catch (err) { setState({ data: empty, loading: false, error: err instanceof Error ? err.message : 'Error inesperado' }); } };
  useEffect(() => { reload(); }, deps);
  return { ...state, reload };
}

function HomePage() {
  const { workspace } = useAuth();
  if (workspace === 'superadmin') return <Navigate to="/app/superadmin" replace />;
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
  const finished = data.workOrders.filter((w: any) => ['Finalizado tecnicamente', 'Enviado', 'Cerrado'].includes(w.status));
  const unassigned = data.workOrders.filter((w: any) => !w.main_technician_name);
  const urgent = data.workOrders.filter((w: any) => ['Alta', 'Critica'].includes(w.priority));
  const delayed = data.workOrders.filter((w: any) => w.scheduled_date === data.prevDay && !['Enviado', 'Cerrado', 'Cancelado'].includes(w.status));
  const openDef = data.deficiencies.filter((d: any) => !['Corregida', 'Cerrada', 'Rechazada'].includes(d.status));
  const criticalAlerts = data.alerts.filter((a: any) => a.priority === 'Critica' || a.type === 'Critico');
  const materialPending = data.materials.filter((m: any) => ['Pendiente', 'Pendiente de material'].includes(m.work_orders?.status));
  const kpis = [
    kpiCard('Técnicos activos', data.technicians.filter((t: any) => t.active).length, 'Hoy', 'Perfiles técnicos activos de la empresa', '/app/modulos/tecnicos'),
    kpiCard('Técnicos en intervención', inProgress.length, 'Ahora', 'Partes operativos en curso', '/app/partes?estado=en-curso'),
    kpiCard('Partes pendientes', pending.length, 'Actual', 'Pendientes de iniciar o descargar', '/app/partes?estado=pendiente'),
    kpiCard('Partes finalizados', finished.length, 'Actual', 'Finalizados, enviados o cerrados', '/app/partes?estado=realizado'),
    kpiCard('Partes sin asignar', unassigned.length, 'Actual', 'Sin técnico principal', '/app/partes?filtro=sin-asignar'),
    kpiCard('Partes urgentes', urgent.length, 'Actual', 'Prioridad alta o crítica', '/app/partes?prioridad=critica'),
    kpiCard('No terminados ayer', delayed.length, data.prevDay, 'Arrastrados del día anterior', '/app/partes?filtro=no-terminados'),
    kpiCard('Checks pendientes', data.pendingChecks.length, 'Actual', 'Por realizar o en curso', '/app/checks?estado=por-realizar'),
    kpiCard('Checks realizados hoy', data.completedChecks.length, data.day, 'Finalizados hoy', '/app/checks?estado=realizado'),
    kpiCard('Deficiencias pendientes', openDef.length, 'Actual', 'Pendientes de valoración', '/app/deficiencias?estado=pendiente'),
    kpiCard('Avisos críticos', criticalAlerts.length, 'Actual', 'Prioridad crítica', '/app/avisos?prioridad=critica'),
    kpiCard('Material pendiente', materialPending.length, 'Actual', 'Material asociado a partes pendientes', '/app/partes?filtro=material'),
  ];
  return <RoleDashboard title="Inicio SAT" subtitle="Centro operativo de planificación, partes, técnicos, checks y avisos." kpis={kpis} quickActions={<><button onClick={() => setMode('work')}>Crear parte</button><Link to="/app/partes?filtro=sin-asignar">Asignar técnico</Link><button onClick={() => setMode('check')}>Crear check</button><button onClick={() => setMode('alert')}>Crear aviso</button><Link to="/app/partes?fecha=hoy">Abrir planificación</Link><Link to="/app/deficiencias?estado=pendiente">Revisar deficiencia</Link></>}><DashboardList title="Trabajos de hoy" allRoute="/app/partes?fecha=hoy" rows={todayWorks.slice(0, 8).map((w: any) => [`${w.scheduled_time ?? 'Sin hora'} · ${w.code}`, `${displayStatus(w.priority)} · ${w.type} · ${w.client_name} · ${w.site_name} · ${w.main_technician_name ?? 'Sin técnico'} · ${displayStatus(w.status)}`, severityForPriority(w.priority), `/app/partes/${w.id}`])} empty="No hay trabajos planificados hoy." /><DashboardList title="Técnicos" allRoute="/app/modulos/tecnicos" rows={data.technicians.slice(0, 6).map((t: any) => [fullName(t), 'Perfil técnico activo · disponibilidad según partes asignados', 'info', `/app/modulos/tecnicos/${t.id}`])} empty="Sin técnicos visibles." /><DashboardList title="Alertas operativas" allRoute="/app/avisos" rows={[...delayed, ...unassigned, ...criticalAlerts, ...openDef].slice(0, 8).map((item: any) => [item.code ?? item.title, item.description ?? item.title ?? item.status, severityForStatus(item.status ?? item.priority), routeForOperationalItem(item)])} empty="Sin alertas operativas destacadas." /><DashboardList title="Actividad reciente" allRoute="/app/partes" rows={data.assignments.slice(0, 8).map((a: any) => [a.work_orders?.code ?? 'Asignación', `${a.assignment_date} · ${fullName(a.profiles)} · ${displayStatus(a.status)}`, severityForStatus(a.status), `/app/partes/${a.work_order_id}`])} empty="Sin actividad reciente." />{mode === 'work' && <WorkOrderForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'alert' && <AlertForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'check' && <CheckForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</RoleDashboard>;
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
  const managementKpis = [kpiCard('Ventas periodo', `${amount.toLocaleString('es-ES')} €`, 'Mes actual', 'Presupuestos aceptados', '/app/modulos/presupuestos?estado=aceptado'), kpiCard('Clientes activos', data.metrics.clients ?? data.clients.length, 'Actual', 'Clientes visibles por RLS', '/app/clientes'), kpiCard('Equipos', data.metrics.equipment ?? 0, 'Actual', 'Inventario instalado', '/app/equipos'), kpiCard('Partes realizados', done.length, 'Actual', 'Enviados o cerrados', '/app/partes?estado=realizado'), kpiCard('Partes pendientes', pending.length, 'Actual', 'Carga abierta', '/app/partes?estado=pendiente'), kpiCard('Partes urgentes', urgent.length, 'Actual', 'Alta o crítica', '/app/partes?prioridad=critica'), kpiCard('Deficiencias abiertas', openDef.length, 'Actual', 'Riesgo técnico/comercial', '/app/deficiencias?estado=abierta'), kpiCard('Oportunidades', data.opportunities.length, 'Actual', 'Pipeline visible', '/app/modulos/oportunidades')];
  const managementAlerts = [...data.alerts, ...openDef].slice(0, 8).map((item: any) => [item.title ?? item.code, item.description ?? item.status, severityForStatus(item.status ?? item.priority), item.related_entity ? routeForAlert(item) : item.code ? `/app/deficiencias/${item.id}` : '/app/avisos'] as [string, string, Severity, string]);
  return <RoleDashboard title="Inicio Gerencia" subtitle="Visión global, rentabilidad, carga operativa y alertas estratégicas." kpis={managementKpis} quickActions={<><button onClick={() => setMode('work')}>Crear parte</button><button onClick={() => setMode('alert')}>Crear aviso</button><Link to="/app/modulos/informes">Abrir informe</Link><Link to="/app/gerencia">Consultar métricas</Link><Link to="/app/deficiencias?filtro=desviaciones">Revisar desviaciones</Link><Link to="/app/clientes">Abrir cliente</Link></>}><InteractiveBars title="Trabajos realizados frente a pendientes" values={[[ 'Realizados', done.length, '/app/partes?estado=realizado'], ['Pendientes', pending.length, '/app/partes?estado=pendiente'], ['Urgentes', urgent.length, '/app/partes?prioridad=critica']]} /><InteractiveBars title="Deficiencias por gravedad" values={['Baja','Media','Alta','Critica'].map((level) => [displayStatus(level), data.deficiencies.filter((d: any) => d.severity === level).length, `/app/deficiencias?gravedad=${level}`]) as any} /><DashboardList title="Alertas de dirección" rows={managementAlerts} empty="Sin alertas estratégicas." />{mode === 'work' && <WorkOrderForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'alert' && <AlertForm onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</RoleDashboard>;
}

function RoleDashboard({ title, subtitle, kpis, quickActions, children }: { title: string; subtitle: string; kpis: any[]; quickActions: ReactNode; children: ReactNode }) {
  return <section className="page dashboard-page"><Breadcrumb items={['Inicio', title]} /><div className="page-head"><div><h2>{title}</h2><p>{subtitle}</p><small>Última actualización: {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</small></div></div><div className="stats-grid dashboard-kpis">{kpis.map((item) => <Link key={item.label} className={`metric ${item.tone}`} to={item.route}><div>{item.icon}<span>{item.label}</span></div><strong>{item.value}</strong><small>{item.period} · {item.help}</small></Link>)}</div><Card title="Acciones rápidas"><div className="actions quick-actions">{quickActions}</div></Card><div className="dashboard-grid">{children}</div></section>;
}

function kpiCard(label: string, value: any, period: string, help: string, route: string, tone: Severity = 'info') {
  return { label, value, period, help, route, tone, icon: <Gauge {...iconProps} /> };
}

function DashboardList({ title, rows, empty, allRoute }: { title: string; rows: [string, string, Severity, string][]; empty: string; allRoute?: string }) {
  return <Card title={title}>{rows.length ? <div className="compact-list dashboard-list">{rows.map(([head, text, tone, route]) => <article key={`${title}-${head}-${text}`}><Badge tone={tone}>{head}</Badge><p>{text}</p><Link to={route}>Abrir</Link></article>)}</div> : <p className="large-note">{empty}</p>}<Link className="link-button" to={allRoute ?? (rows[0]?.[3] ? rows[0][3].split('?')[0] : '/app/inicio')}>Ver todos</Link></Card>;
}

function SuperadminGuard({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  if (!isSuperadmin(profile)) return <section className="page"><Card title="No tienes permiso para acceder a esta zona"><p className="form-error"><ShieldAlert size={16} />No tienes permiso para acceder a esta zona</p><Link className="primary" to="/app/inicio">Volver al inicio</Link></Card></section>;
  return <>{children}</>;
}

function SuperadminCompanyScope() {
  const { companyId, setCompanyId } = useSuperadminScope();
  const { data, loading, error, reload } = useLoad(() => superadminService.companies(), [], [] as any[]);
  return <Card title="Ámbito de gestión">
    <div className="filters local-filters">
      <FormSelect
        label="Empresa"
        value={companyId ?? ''}
        onChange={(value) => setCompanyId(value || null)}
        loading={loading}
        emptyLabel="Todas las empresas"
        options={data.map((company: any) => ({ value: company.id, label: `${company.name}${company.active ? '' : ' · Inactiva'}` }))}
      />
      <p className="large-note">{companyId ? 'Mostrando y gestionando únicamente la empresa seleccionada.' : 'Vista global del propietario DMP. Selecciona una empresa antes de crear registros operativos.'}</p>
      {error && <button className="link-button" onClick={reload}>Reintentar carga de empresas</button>}
    </div>
  </Card>;
}

function SuperadminHome() {
  const { companyId } = useSuperadminScope();
  const { data, loading, error, reload } = useLoad(() => superadminService.overview(companyId), [companyId], null as any);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const roleCounts = data.roles.map((role: any) => [role.name, data.profiles.filter((profile: any) => profile.profile_roles?.some((item: any) => item.roles?.name === role.name)).length, '/app/superadmin/roles']) as [string, number, string][];
  const openWorkOrders = data.workOrders.filter((row: any) => !['Enviado', 'Cerrado', 'Cancelado'].includes(row.status));
  const pendingChecks = data.checks.filter((row: any) => ['Por realizar', 'En curso'].includes(row.status));
  const kpis = [
    kpiCard('Usuarios totales', data.profiles.length, 'Global', 'Perfiles visibles por RLS', '/app/superadmin/usuarios', 'info'),
    kpiCard('Usuarios activos', data.profiles.filter((row: any) => row.active).length, 'Global', 'Activos en profiles', '/app/superadmin/usuarios', 'ok'),
    kpiCard('Usuarios inactivos', data.profiles.filter((row: any) => !row.active).length, 'Global', 'Desactivados en profiles', '/app/superadmin/usuarios', 'warn'),
    kpiCard('Clientes', data.clients.length, 'Global', 'Clientes no eliminados', '/app/superadmin/clientes', 'commercial'),
    kpiCard('Centros', data.sites.length, 'Global', 'Centros no eliminados', '/app/superadmin/centros', 'maintenance'),
    kpiCard('Equipos', data.equipment.length, 'Global', 'Equipos no eliminados', '/app/superadmin/equipos', 'info'),
    kpiCard('Partes abiertos', openWorkOrders.length, 'Global', 'Carga operativa abierta', '/app/superadmin/partes', 'warn'),
    kpiCard('Checks pendientes', pendingChecks.length, 'Global', 'Checks por realizar/en curso', '/app/superadmin/checks', 'danger'),
    kpiCard('Errores sync', 0, 'No configurado', 'Todavía no existe tabla de sincronización global', '/app/superadmin/sincronizacion', 'muted'),
  ];
  return <><section className="page"><SuperadminCompanyScope /></section><RoleDashboard title="Panel Superadmin / Propietario DMP" subtitle="Gobierno global de empresas, usuarios, permisos y operaciones." kpis={kpis} quickActions={<><Link to="/app/superadmin/usuarios">Gestionar usuarios</Link><Link to="/app/superadmin/usuarios/nuevo">Crear usuario</Link><Link to="/app/superadmin/roles">Roles y permisos</Link><Link to="/app/superadmin/plantillas">Plantillas de checks</Link><Link to="/app/superadmin/auditoria">Auditoría</Link><Link to="/app/superadmin/clientes">Clientes</Link><Link to="/app/superadmin/partes">Partes</Link></>}><InteractiveBars title="Usuarios por rol" values={roleCounts.length ? roleCounts : [['Sin roles', 0, '/app/superadmin/roles']]} /><DashboardList title="Últimos usuarios creados" rows={data.profiles.slice(0, 8).map((profile: any) => [fullName(profile) || profile.email, `${profile.email} · ${profile.active ? 'Activo' : 'Inactivo'} · ${rolesText(profile)} · ${profile.primary_area}`, profile.active ? 'ok' : 'warn', '/app/superadmin/usuarios'])} empty="Sin registros" /><DashboardList title="Última actividad relevante" rows={[...data.activity, ...data.audit].slice(0, 8).map((item: any) => [item.action ?? item.operation ?? 'Evento', `${item.entity_type ?? item.table_name ?? 'Sistema'} · ${formatDate(item.created_at ?? item.changed_at)}`, 'info', '/app/superadmin/auditoria'])} empty="Sin registros" /><Card title="Sincronización técnica"><p className="large-note">La cola offline técnica se guarda por dispositivo en IndexedDB y se revisa desde Sincronización. No se muestran contadores globales inventados.</p></Card><Card title="Seguridad de contraseñas"><p className="large-note">Las contraseñas no se muestran ni se leen. Crear usuarios Auth, invitar y resetear contraseñas debe ejecutarse mediante Supabase Auth desde backend seguro o Edge Function, nunca con una clave de servicio en el navegador.</p></Card></RoleDashboard></>;
}

function SuperadminUsersLegacy() {
  const { data, loading, error, reload } = useLoad(() => superadminService.users(), [], [] as any[]);
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState(''); const [actionError, setActionError] = useState('');
  const [filter, setFilter] = useState('');
  const rows = data.filter((user) => `${fullName(user)} ${user.email} ${rolesText(user)}`.toLowerCase().includes(filter.toLowerCase()));
  const toggle = async (user: any) => { await superadminService.setActive(user.id, !user.active); setMessage(user.active ? 'Usuario desactivado.' : 'Usuario activado.'); reload(); };
  return <section className="page"><Breadcrumb items={['Propietario DMP', 'Usuarios']} /><div className="page-head"><div><h2>Usuarios</h2><p>Gestión de perfiles, roles y estado. Las contraseñas están protegidas y no se listan.</p></div><button className="primary" onClick={() => setCreating(true)}>Crear usuario</button></div>{message && <p className="success-note">{message}</p>}{actionError && <p className="form-error">{actionError}</p>}<div className="filters local-filters"><label><Search size={16} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Buscar usuario, email o rol..." /></label></div><StateBlock loading={loading} error={error} retry={reload} empty={!rows.length}><div className="table-card"><table><thead><tr><th>Nombre</th><th>Email/login</th><th>Rol principal</th><th>Roles adicionales</th><th>Estado</th><th>Contraseña</th><th>Fechas</th><th>Acciones</th></tr></thead><tbody>{rows.map((user: any) => <tr key={user.id}><td>{fullName(user)}<span>Técnico/comercial asociado: perfil DMP</span></td><td>{user.email}<span>{user.username ?? 'Login no informado'}</span></td><td>{displayStatus(user.primary_area)}</td><td>{rolesText(user)}</td><td>{user.active ? 'Activo' : 'Inactivo'}</td><td><Badge tone="muted">Contraseña protegida</Badge><span>No visible por seguridad</span></td><td>{formatDate(user.created_at)}<span>Último cambio: {formatDate(user.updated_at)}</span><span>Último acceso: no disponible sin backend Auth</span></td><td><div className="row-actions"><button onClick={() => setEditing(user)}>Editar</button><button onClick={() => toggle(user)}>{user.active ? 'Desactivar' : 'Activar'}</button></div></td></tr>)}</tbody></table></div></StateBlock>{creating && <SuperadminUserForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setMessage('Perfil creado. Crea o invita el usuario en Supabase Auth desde backend seguro y enlaza auth_user_id.'); reload(); }} />}{editing && <SuperadminUserForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage('Usuario actualizado.'); reload(); }} />}</section>;
}

function SuperadminUsers() {
  const { companyId } = useSuperadminScope();
  const { data, loading, error, reload } = useLoad(() => superadminService.users(companyId), [companyId], [] as any[]);
  const [editing, setEditing] = useState<any | null>(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [area, setArea] = useState('todas');
  const [active, setActive] = useState('todos');
  const rows = data.filter((user) => {
    const haystack = `${user.first_name ?? ''} ${user.last_name ?? ''} ${user.email ?? ''} ${user.phone ?? ''} ${user.auth_user_id ?? ''} ${user.company_id ?? ''} ${user.primary_area ?? ''} ${rolesText(user)}`.toLowerCase();
    const areaOk = area === 'todas' || normalizeArea(user.primary_area) === area;
    const activeOk = active === 'todos' || (active === 'activos' ? user.active : !user.active);
    return haystack.includes(search.toLowerCase()) && areaOk && activeOk;
  });
  const toggle = async (user: any) => { try { await superadminService.setActive(user.id, !user.active); setMessage(user.active ? 'Usuario desactivado. No podrá entrar aunque conserve cuenta Auth.' : 'Usuario activado.'); reload(); } catch (err) { console.error(err); setMessage(err instanceof Error ? err.message : 'No se ha podido cambiar el estado.'); } };
  const remove = async (user: any) => { if (!window.confirm(`Eliminar lógicamente a ${user.email}?`)) return; try { await superadminService.softDeleteProfile(user.id); setMessage('Usuario eliminado lógicamente y desactivado.'); reload(); } catch (err) { console.error(err); setMessage(err instanceof Error ? err.message : 'No se ha podido eliminar lógicamente.'); } };
  return <section className="page"><Breadcrumb items={['Propietario DMP', 'Usuarios']} /><SuperadminCompanyScope /><div className="page-head"><div><h2>Usuarios</h2><p>Listado global de perfiles. No se muestran ni se guardan contraseñas.</p></div><Link className="primary" to="/app/superadmin/users/new">Crear usuario</Link></div>{message && <p className="success-note">{message}</p>}<div className="filters local-filters"><label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, email, UID, empresa o rol..." /></label><FormSelect label="Área" value={area} onChange={setArea} options={[{ value: 'todas', label: 'Todas' }, ...areaOptions().map((item) => ({ value: normalizeArea(item), label: areaLabel(item) }))]} /><FormSelect label="Estado" value={active} onChange={setActive} options={[{ value: 'todos', label: 'Todos' }, { value: 'activos', label: 'Activos' }, { value: 'inactivos', label: 'Inactivos' }]} /></div><StateBlock loading={loading} error={error} retry={reload} empty={!rows.length}><div className="table-card"><table><thead><tr><th>Nombre</th><th>Apellidos</th><th>Email</th><th>Empresa</th><th>Área/rol principal</th><th>Activo</th><th>auth_user_id</th><th>Fechas</th><th>Acciones</th></tr></thead><tbody>{rows.map((user: any) => <tr key={user.id}><td>{user.first_name}<span>{rolesText(user)}</span></td><td>{user.last_name}</td><td>{user.email}</td><td>{user.companies?.name ?? user.company_id}</td><td>{areaLabel(user.primary_area)}</td><td>{user.active ? 'Activo' : 'Inactivo'}</td><td><small>{user.auth_user_id ?? 'Sin enlazar'}</small></td><td>{formatDate(user.created_at)}<span>Actualizado: {formatDate(user.updated_at)}</span>{user.deleted_at && <span>Eliminado: {formatDate(user.deleted_at)}</span>}</td><td><div className="row-actions"><button onClick={() => setEditing(user)}>Ver / editar</button><button onClick={() => toggle(user)}>{user.active ? 'Desactivar' : 'Activar'}</button><button onClick={() => setEditing({ ...user, mode: 'roles' })}>Cambiar área/rol</button><button onClick={() => setEditing({ ...user, mode: 'auth' })}>Vincular Auth UID</button><button onClick={() => setMessage('Reset o invitación requiere backend seguro o Edge Function. No se usa clave de servicio en frontend.')}>Reset contraseña</button><button onClick={() => remove(user)}>Eliminar lógico</button></div></td></tr>)}</tbody></table></div></StateBlock>{editing && <SuperadminProfileForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage('Usuario guardado.'); reload(); }} />}</section>;
}

function SuperadminUserCreate() {
  const navigate = useNavigate();
  return <section className="page"><Breadcrumb items={['Propietario DMP', 'Crear usuario']} /><Hero title="Crear usuario" subtitle="Crea un perfil DMP. Para acceso real, crea antes el usuario en Supabase Auth y pega aquí su UID." tone="info" /><SuperadminProfileForm onClose={() => navigate('/app/superadmin/usuarios')} onSaved={() => navigate('/app/superadmin/usuarios')} /></section>;
}

function SuperadminProfileForm({ initial, onClose, onSaved }: any) {
  const { companyId } = useSuperadminScope();
  const companies = useLoad(() => superadminService.companies(), [], [] as any[]);
  const [values, setValues] = useState<Record<string, any>>({ first_name: '', last_name: '', email: '', phone: '', primary_area: 'SAT', active: true, auth_user_id: '', company_id: companyId ?? '', roles: initial ? rolesList(initial) : ['SAT'], ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const roles = normalizedRoleNames(values.primary_area, values.roles?.length ? values.roles : [values.primary_area]);
      const payload = { first_name: values.first_name, last_name: values.last_name, email: values.email, phone: values.phone || null, primary_area: roles.includes('SAT') ? 'SAT' : values.primary_area, active: values.active === true || values.active === 'true', auth_user_id: values.auth_user_id || null, company_id: values.company_id || null };
      await superadminService.saveProfileWithRoles(initial?.id ?? null, payload, roles);
      onSaved?.();
    } catch (err) { console.error(err); setError(err instanceof Error ? err.message : 'No se ha podido guardar el usuario.'); }
    finally { setSaving(false); }
  };
  const toggleRole = (role: string) => setValues((current) => ({ ...current, roles: toggleExclusiveRole(current.roles ?? [], role), primary_area: role === 'SAT' || role === 'Comercial' ? role : current.primary_area }));
  useEffect(() => { const roles = selectPrimaryRole(values.roles ?? [], values.primary_area); if (roles.join('|') !== (values.roles ?? []).join('|')) set('roles', roles); }, [values.primary_area, (values.roles ?? []).join('|')]);
  return <ModalForm title={initial?.id ? 'Editar usuario' : 'Crear usuario'} onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel={initial?.id ? 'Guardar usuario' : 'Crear perfil'}><p className="large-note">No se guarda ni se muestra ninguna contraseña. Crea el usuario en Supabase Auth y pega aquí su UID hasta disponer de la Edge Function de invitación.</p><p className="large-note">Regla de roles: SAT y Comercial son incompatibles en el mismo perfil. Al seleccionar uno se desmarca el otro inmediatamente.</p><div className="form-grid"><FormSelect label="Empresa" value={values.company_id} onChange={(value) => set('company_id', value)} required loading={companies.loading} options={companies.data.map((company: any) => ({ value: company.id, label: company.name }))} /><label>Nombre *<input value={values.first_name ?? ''} onChange={(event) => set('first_name', event.target.value)} required /></label><label>Apellidos *<input value={values.last_name ?? ''} onChange={(event) => set('last_name', event.target.value)} required /></label><label>Email *<input type="email" value={values.email ?? ''} onChange={(event) => set('email', event.target.value)} required /></label><label>Teléfono<input value={values.phone ?? ''} onChange={(event) => set('phone', event.target.value)} /></label><FormSelect label="Área/rol principal" value={values.primary_area} onChange={(value) => { set('primary_area', value); if (!values.roles.includes(value)) set('roles', [...values.roles, value]); }} required options={areaOptions().map((value) => ({ value, label: areaLabel(value) }))} /><FormSelect label="Estado" value={String(values.active)} onChange={(value) => set('active', value)} options={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo' }]} /><label>auth_user_id<input value={values.auth_user_id ?? ''} onChange={(event) => set('auth_user_id', event.target.value)} placeholder="UUID de auth.users.id" /></label></div><Card title="Roles adicionales"><div className="component-select">{areaOptions().map((role) => <label key={role}><input type="checkbox" checked={values.roles.includes(role)} onChange={() => toggleRole(role)} /> {areaLabel(role)}</label>)}</div></Card><Card title="Contraseñas"><p className="large-note">El acceso Auth debe crearse o invitarse desde backend seguro. No se usa ninguna clave de servicio en el navegador.</p></Card></ModalForm>;
}

function SuperadminSettings() {
  const { companyId } = useSuperadminScope();
  const roles = useLoad(() => superadminService.roles(), [], [] as any[]);
  const companies = useLoad(() => superadminService.companies(), [], [] as any[]);
  return <section className="page"><Breadcrumb items={['Propietario DMP', 'Configuración']} /><Hero title="Configuración superadmin" subtitle="Ajustes globales operativos de ámbito, empresas y roles visibles." tone="info" /><SuperadminCompanyScope /><div className="grid half"><Card title="Ámbito activo"><InfoGrid items={[[ 'Empresa seleccionada', companies.data.find((company: any) => company.id === companyId)?.name ?? 'Todas las empresas' ], [ 'Empresas visibles', companies.data.length ], [ 'Empresas activas', companies.data.filter((company: any) => company.active).length ], [ 'Roles disponibles', roles.data.map((role: any) => role.name).join(', ') || '-' ]]} /></Card><Card title="Acciones de gobierno"><div className="actions"><Link to="/app/superadmin/usuarios">Gestionar usuarios</Link><Link to="/app/superadmin/roles">Revisar permisos</Link><Link to="/app/superadmin/plantillas">Plantillas globales</Link><Link to="/app/superadmin/auditoria">Auditoría</Link></div>{(roles.error || companies.error) && <p className="form-error">{roles.error || companies.error}</p>}</Card></div></section>;
}

function SuperadminRoles() {
  const permissions = ['ver clientes','crear clientes','editar clientes','ver centros','crear centros','editar centros','ver equipos','crear equipos','editar equipos','ver partes','crear partes','editar partes','asignar técnicos','ver checks','crear checks','ejecutar checks','sincronizar trabajo técnico','ver facturación','ver documentación','gestionar usuarios','gestionar plantillas','ver auditoría'];
  const roles = ['superadmin','Gerencia','SAT','Comercial','Oficina','Tecnico'];
  return <section className="page"><Breadcrumb items={['Propietario DMP', 'Roles y permisos']} /><Hero title="Roles y permisos" subtitle="Matriz preparada para el modelo de permisos de DoorManager Pro." tone="info" /><Card title="Matriz de permisos"><div className="table-card slim"><table><thead><tr><th>Rol</th>{permissions.map((permission) => <th key={permission}>{permission}</th>)}</tr></thead><tbody>{roles.map((role) => <tr key={role}><td>{role === 'superadmin' ? 'Propietario DMP' : role}</td>{permissions.map((permission) => <td key={`${role}-${permission}`}>{permissionForRole(role, permission) ? 'Sí' : 'No'}</td>)}</tr>)}</tbody></table></div><p className="large-note">Matriz informativa. La seguridad real depende de RLS y de las RPC `SECURITY DEFINER` endurecidas.</p></Card></section>;
}

function SuperadminTemplates() {
  const { workspace } = useAuth();
  const { companyId } = useSuperadminScope();
  const isPlatformScope = workspace === 'superadmin';
  const templateScope = isPlatformScope ? companyId : undefined;
  const { data, loading, error, reload } = useLoad(() => superadminService.templates(templateScope), [templateScope], [] as any[]);
  const [form, setForm] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const run = async (operation: () => Promise<any>, ok: string) => { try { setActionError(''); await operation(); setMessage(ok); reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido completar la operación.'); } };
  const toggle = (template: any) => run(() => superadminService.toggleTemplate(template.id, !template.active), template.active ? 'Plantilla desactivada.' : 'Plantilla activada.');
  const duplicate = (template: any) => run(() => superadminService.duplicateTemplate(template), 'Plantilla duplicada con sus bloques e ítems.');
  return <section className="page"><Breadcrumb items={[(isPlatformScope ? 'Propietario DMP' : 'SAT'), 'Plantillas de checks']} />{isPlatformScope && <SuperadminCompanyScope />}<div className="page-head"><div><h2>Plantillas de checks</h2><p>Crear, editar, duplicar, ordenar y activar plantillas visibles por RLS de la empresa.</p></div><button className="primary" disabled={isPlatformScope && !companyId} onClick={() => setForm({ type: 'template', initial: { company_id: isPlatformScope ? companyId : undefined, active: true, version: '1.0' } })}>Crear plantilla</button></div>{message && <p className="success-note">{message}</p>}{actionError && <p className="form-error">{actionError}</p>}<StateBlock loading={loading} error={error} retry={reload} empty={!data.length}><div className="grid half">{data.map((template: any) => { const sections = [...(template.check_template_sections ?? [])].sort(byTemplatePosition); return <Card key={template.id} title={template.name} action={<button onClick={() => toggle(template)}>{template.active ? 'Desactivar' : 'Activar'}</button>}><InfoGrid items={[[ 'Tipo compatible', template.equipment_types?.name ?? 'Global' ], [ 'Empresa', template.companies?.name ?? template.company_id ?? '-' ], [ 'Versión', template.version ], [ 'Estado', template.active ? 'Activo' : 'Inactivo' ], [ 'Bloques', String(sections.length) ], [ 'Ítems', String(sections.reduce((sum: number, section: any) => sum + (section.check_template_items?.length ?? 0), 0)) ], [ 'Creación', formatDate(template.created_at) ], [ 'Última modificación', formatDate(template.updated_at) ]]} /><div className="actions"><button onClick={() => setForm({ type: 'template', initial: template })}>Editar plantilla</button><button onClick={() => duplicate(template)}>Duplicar plantilla</button><button onClick={() => setForm({ type: 'section', template, initial: { position: sections.length + 1 } })}>Añadir bloque</button></div><div className="template-builder">{sections.map((section: any, index: number) => { const items = [...(section.check_template_items ?? [])].sort(byTemplatePosition); return <article key={section.id} className="template-section"><header><strong>{section.position}. {section.title}</strong><div className="row-actions"><button onClick={() => setForm({ type: 'section', template, initial: section })}>Editar</button><button disabled={index === 0} onClick={() => run(() => superadminService.reorderSections(moveItem(sections, index, index - 1)), 'Bloques reordenados.')}>Subir</button><button disabled={index === sections.length - 1} onClick={() => run(() => superadminService.reorderSections(moveItem(sections, index, index + 1)), 'Bloques reordenados.')}>Bajar</button><button onClick={() => window.confirm('Eliminar este bloque solo si no tiene resultados asociados?') && run(() => superadminService.deleteSection(section.id), 'Bloque eliminado si no tenía resultados vinculados.')}>Eliminar</button></div></header><div className="template-items">{items.map((item: any, itemIndex: number) => <div key={item.id} className="template-item"><span>{item.position}. {item.title} · {item.component} · {item.mandatory ? 'Obligatorio' : 'Opcional'}</span><div className="row-actions"><button onClick={() => setForm({ type: 'item', section, initial: item })}>Editar</button><button disabled={itemIndex === 0} onClick={() => run(() => superadminService.reorderItems(moveItem(items, itemIndex, itemIndex - 1)), 'Ítems reordenados.')}>Subir</button><button disabled={itemIndex === items.length - 1} onClick={() => run(() => superadminService.reorderItems(moveItem(items, itemIndex, itemIndex + 1)), 'Ítems reordenados.')}>Bajar</button><button onClick={() => window.confirm('Eliminar este ítem solo si no tiene resultados asociados?') && run(() => superadminService.deleteItem(item.id), 'Ítem eliminado si no tenía resultados vinculados.')}>Eliminar</button></div></div>)}<button onClick={() => setForm({ type: 'item', section, initial: { position: items.length + 1, mandatory: true } })}>Añadir ítem</button></div></article>; })}</div></Card>; })}</div></StateBlock>{form?.type === 'template' && <TemplateForm initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}{form?.type === 'section' && <TemplateSectionForm template={form.template} initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}{form?.type === 'item' && <TemplateItemForm section={form.section} initial={form.initial} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />}</section>;
}

function TemplateForm({ initial, onClose, onSaved }: any) {
  const types = useLoad(() => equipmentService.types(initial?.company_id), [initial?.company_id], [] as any[]);
  const [values, setValues] = useState<Record<string, any>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { const result = values.id ? await superadminService.updateTemplate(values.id, values) : await superadminService.createTemplate(values); onSaved(result); } catch (err) { console.error(err); setError(err instanceof Error ? err.message : 'No se ha podido guardar la plantilla.'); } finally { setSaving(false); } };
  return <ModalForm title={values.id ? 'Editar plantilla' : 'Crear plantilla'} onClose={onClose} onSubmit={submit} saving={saving} error={error}><label>Nombre *<input value={values.name ?? ''} onChange={(event) => set('name', event.target.value)} required /></label><label>Versión *<input value={values.version ?? '1.0'} onChange={(event) => set('version', event.target.value)} required /></label><FormSelect label="Tipo compatible" value={values.equipment_type_id} onChange={(value) => set('equipment_type_id', value)} options={types.data.map((type) => ({ value: type.id, label: type.name }))} loading={types.loading} /><label className="checkbox-line"><input type="checkbox" checked={Boolean(values.active)} onChange={(event) => set('active', event.target.checked)} /> Activa</label></ModalForm>;
}

function TemplateSectionForm({ template, initial, onClose, onSaved }: any) {
  return <EntityForm title={initial?.id ? 'Editar bloque' : 'Añadir bloque'} fields={[[ 'title', 'Título', true ], [ 'position', 'Orden', true ]]} initial={initial} onClose={onClose} onSubmit={(values: any) => initial?.id ? superadminService.updateSection(initial.id, values) : superadminService.createSection(template.id, values)} onSaved={onSaved} />;
}

function TemplateItemForm({ section, initial, onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { const result = values.id ? await superadminService.updateItem(values.id, values) : await superadminService.createItem(section.id, values); onSaved(result); } catch (err) { console.error(err); setError(err instanceof Error ? err.message : 'No se ha podido guardar el ítem.'); } finally { setSaving(false); } };
  return <ModalForm title={values.id ? 'Editar ítem' : 'Añadir ítem'} onClose={onClose} onSubmit={submit} saving={saving} error={error}><label>Título *<input value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} required /></label><label>Componente<input value={values.component ?? ''} onChange={(event) => set('component', event.target.value)} placeholder="Si se deja vacío se usa el título" /></label><label>Orden *<input type="number" min="1" value={values.position ?? ''} onChange={(event) => set('position', event.target.value)} required /></label><label className="checkbox-line"><input type="checkbox" checked={values.mandatory !== false} onChange={(event) => set('mandatory', event.target.checked)} /> Obligatorio</label></ModalForm>;
}

function SuperadminSync() {
  const { pending, summary, reload } = useOfflineQueue();
  return <section className="page"><Breadcrumb items={['Propietario DMP', 'Sincronización']} /><Hero title="Sincronización" subtitle="Estado local visible para el usuario actual. Los errores globales requieren backend o tabla agregada." tone="warn" /><Card title="Resumen local"><InfoGrid items={[[ 'Pendientes', summary.pending ], [ 'Fallidos', summary.failed ], [ 'Cola', 'IndexedDB local por dispositivo' ], [ 'Último intento', pending[0]?.updatedAt ? formatDate(pending[0].updatedAt) : '-' ]]} /><button onClick={reload}>Actualizar</button></Card><CompactRows rows={pending.map((item) => [displayStatus(item.status), `Motivo: ${item.error ?? '-'} · Usuario/técnico: sesión actual · Parte: ${item.workOrderId ?? '-'} · Check: ${item.checkId ?? '-'}`, item.status === 'failed' ? 'danger' : 'warn', '/app/pendientes'])} empty="Sin pendientes locales visibles." /></section>;
}

function SuperadminAudit() {
  const { companyId } = useSuperadminScope();
  const { data, loading, error, reload } = useLoad(() => superadminService.audit(companyId), [companyId], [] as any[]);
  return <section className="page"><Breadcrumb items={['Propietario DMP', 'Auditoría']} /><Hero title="Auditoría" subtitle="Eventos relevantes registrados en public.audit_log." tone="info" /><StateBlock loading={loading} error={error} retry={reload} empty={!data.length}><div className="table-card"><table><thead><tr><th>Evento</th><th>Tabla</th><th>Usuario</th><th>Fecha</th><th>Detalle</th></tr></thead><tbody>{data.map((row: any) => <tr key={row.id}><td>{row.operation}</td><td>{row.table_name}</td><td>{fullName(row.profiles) || row.profiles?.email || '-'}</td><td>{formatDate(row.changed_at)}</td><td>{row.record_id ? 'Registro auditado' : 'Sin registro'}</td></tr>)}</tbody></table></div></StateBlock></section>;
}

function InteractiveBars({ title, values }: { title: string; values: [string, number, string][] }) {
  const max = Math.max(1, ...values.map((item) => item[1]));
  return <Card title={title}><div className="interactive-bars">{values.map(([label, value, route]) => <Link key={label} to={route} title={`Ver registros de ${label}`}><span style={{ height: `${Math.max(12, (value / max) * 120)}px` }} /><strong>{value}</strong><small>{label}</small></Link>)}</div><p className="large-note">Pulsa una barra para ver los registros origen del periodo actual.</p></Card>;
}

function ClientsPage() {
  const { workspace } = useAuth();
  const { companyId } = useSuperadminScope();
  const [search, setSearch] = useState('');
  const scope = workspace === 'superadmin' ? companyId : undefined;
  const { data, loading, error, reload } = useLoad(() => clientsService.list(search, scope), [search, scope], [] as any[]);
  const [creating, setCreating] = useState(false);
  const baseRoute = workspace === 'superadmin' ? '/app/superadmin/clientes' : '/app/clientes';
  return <>{workspace === 'superadmin' && <section className="page"><SuperadminCompanyScope /></section>}<ListPage title="Clientes" summary="Listado conectado a public.clients y public.client_contacts." search={search} setSearch={setSearch} action={<button className="primary" disabled={workspace === 'superadmin' && !companyId} onClick={() => setCreating(true)}>Crear cliente</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="grid half">{data.map((client) => <Card key={client.id} title={client.legal_name} action={<Link to={`${baseRoute}/${client.id}`}>Abrir</Link>}><InfoGrid items={[[ 'Empresa', client.companies?.name ?? '-' ], [ 'Código', client.code ], [ 'Nombre comercial', client.trade_name ?? '-' ], [ 'NIF', client.tax_id ?? '-' ], [ 'Estado', client.status ], [ 'Teléfono', client.phone ?? '-' ], [ 'Correo', client.email ?? '-' ], [ 'Centros', String(client.sites?.length ?? 0) ], [ 'Equipos', String(client.equipment?.length ?? 0) ]]} /></Card>)}</div>{creating && <ClientForm title="Crear cliente" initial={{ company_id: companyId }} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage></>;
}

function ClientDetailPage({ forcedId }: { forcedId?: string } = {}) {
  const { id: routeId = '' } = useParams();
  const id = forcedId ?? routeId;
  const { data, loading, error, reload } = useLoad(() => clientsService.get(id), [id], null as any);
  const [mode, setMode] = useState<'edit' | 'contact' | 'site' | 'equipment' | 'work' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  return <section className="page"><BackButton /><Hero title={data.legal_name} subtitle={`${data.code} · ${data.status}`} tone={severityForStatus(data.status)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar cliente</button><button onClick={() => setMode('contact')}>Añadir contacto</button><button onClick={() => setMode('site')}>Crear centro</button><button onClick={() => setMode('equipment')}>Crear equipo</button><button onClick={() => setMode('work')}>Crear parte</button></div><div className="grid two-one"><Card title="Datos del cliente"><InfoGrid items={[[ 'Código', data.code ], [ 'Razón social', data.legal_name ], [ 'Nombre comercial', data.trade_name ?? '-' ], [ 'NIF', data.tax_id ?? '-' ], [ 'Dirección', data.address ?? '-' ], [ 'Localidad', data.city ?? '-' ], [ 'Provincia', data.province ?? '-' ], [ 'CP', data.postal_code ?? '-' ], [ 'País', data.country ?? '-' ], [ 'Teléfono', data.phone ?? '-' ], [ 'Correo', data.email ?? '-' ], [ 'Observaciones', data.notes ?? '-' ]]} /></Card><Card title="Contactos"><CompactRows rows={(data.client_contacts ?? []).map((item: any) => [fullName(item), `${item.role ?? '-'} · ${item.email ?? '-'} · ${item.phone ?? '-'}`, item.is_primary ? 'ok' : 'info', `/app/clientes/${data.id}`])} empty="Sin contactos." /></Card></div><Related title="Relaciones" groups={[['Centros', data.sites, '/app/centros'], ['Equipos', data.equipment, '/app/equipos'], ['Expedientes', data.cases, '/app/expedientes'], ['Partes', data.work_orders, '/app/partes']]} />{mode === 'edit' && <ClientForm title="Modificar cliente" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'contact' && <ContactForm clientId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'site' && <SiteForm title="Crear centro" initial={{ client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'equipment' && <EquipmentForm initial={{ client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>;
}

function SitesPage() { const { workspace } = useAuth(); const { companyId } = useSuperadminScope(); const scope = workspace === 'superadmin' ? companyId : undefined; const baseRoute = workspace === 'superadmin' ? '/app/superadmin/centros' : '/app/centros'; const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => sitesService.list(search, scope), [search, scope], [] as any[]); const [creating, setCreating] = useState(false); return <>{workspace === 'superadmin' && <section className="page"><SuperadminCompanyScope /></section>}<ListPage title="Centros" summary="Centros conectados con cliente, accesos, contactos, equipos y partes." search={search} setSearch={setSearch} action={<button className="primary" disabled={workspace === 'superadmin' && !companyId} onClick={() => setCreating(true)}>Crear centro</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="grid half">{data.map((site) => <Card key={site.id} title={site.name} action={<Link to={`${baseRoute}/${site.id}`}>Abrir</Link>}><InfoGrid items={[[ 'Empresa', site.companies?.name ?? '-' ], [ 'Código', site.code ], [ 'Cliente', site.clients?.legal_name ?? '-' ], [ 'Dirección', site.address ?? '-' ], [ 'Horario', site.schedule ?? '-' ], [ 'Equipos', String(site.equipment?.length ?? 0) ], [ 'Partes', String(site.work_orders?.length ?? 0) ]]} /></Card>)}</div>{creating && <SiteForm title="Crear centro" initial={{ company_id: companyId }} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage></>; }

function SiteDetailPage() { const { id = '' } = useParams(); const { data, loading, error, reload } = useLoad(() => sitesService.get(id), [id], null as any); const [mode, setMode] = useState<'edit' | 'contact' | 'equipment' | 'work' | null>(null); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={data.name} subtitle={`${data.code} · ${data.clients?.legal_name ?? ''}`} tone="maintenance" /><div className="actions"><button onClick={() => setMode('edit')}>Modificar centro</button><button onClick={() => setMode('contact')}>Añadir contacto</button><button onClick={() => setMode('equipment')}>Crear equipo</button><button onClick={() => setMode('work')}>Crear parte</button></div><Card title="Datos del centro"><InfoGrid items={[[ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Dirección', data.address ?? '-' ], [ 'Localidad', data.city ?? '-' ], [ 'Provincia', data.province ?? '-' ], [ 'CP', data.postal_code ?? '-' ], [ 'Horario', data.schedule ?? '-' ], [ 'Requisitos de acceso', data.access_requirements?.description ?? '-' ], [ 'Observaciones', data.notes ?? '-' ]]} /></Card><Related title="Relaciones" groups={[['Equipos instalados', data.equipment, '/app/equipos'], ['Expedientes', data.cases, '/app/expedientes'], ['Partes', data.work_orders, '/app/partes']]} />{mode === 'edit' && <SiteForm title="Modificar centro" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'contact' && <SiteContactForm siteId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'equipment' && <EquipmentForm initial={{ client_id: data.client_id, site_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ client_id: data.client_id, site_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>; }

function EquipmentPage() { const { workspace } = useAuth(); const { companyId } = useSuperadminScope(); const scope = workspace === 'superadmin' ? companyId : undefined; const baseRoute = workspace === 'superadmin' ? '/app/superadmin/equipos' : '/app/equipos'; const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => equipmentService.list(search, scope), [search, scope], [] as any[]); const [creating, setCreating] = useState(false); return <>{workspace === 'superadmin' && <section className="page"><SuperadminCompanyScope /></section>}<ListPage title="Equipos" summary="Inventario conectado a public.equipment, tipos y componentes." search={search} setSearch={setSearch} action={<button className="primary" disabled={workspace === 'superadmin' && !companyId} onClick={() => setCreating(true)}>Crear equipo</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="grid half">{data.map((item) => <Card key={item.id} title={item.code} action={<Link to={`${baseRoute}/${item.id}`}>Abrir</Link>}><InfoGrid items={[[ 'Empresa', item.companies?.name ?? '-' ], [ 'Tipo', item.equipment_types?.name ?? '-' ], [ 'Cliente', item.clients?.legal_name ?? '-' ], [ 'Centro', item.sites?.name ?? '-' ], [ 'Ubicación', item.internal_location ?? '-' ], [ 'Marca/modelo', `${item.brand ?? '-'} ${item.model ?? ''}` ], [ 'Estado', displayStatus(item.status) ], [ 'Próxima revisión', item.next_review_date ?? '-' ]]} /></Card>)}</div>{creating && <EquipmentForm initial={{ company_id: companyId }} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage></>; }

function EquipmentDetailPage() { const { id = '' } = useParams(); const navigate = useNavigate(); const { data, loading, error, reload } = useLoad(() => equipmentService.get(id), [id], null as any); const history = useLoad(() => equipmentService.history(id), [id], [] as any[]); const [mode, setMode] = useState<'edit' | 'component' | 'work' | 'check' | null>(null); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.equipment_types?.name ?? 'Equipo'}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar equipo</button><button onClick={() => setMode('component')}>Añadir componente</button><button onClick={() => setMode('work')}>Crear parte desde equipo</button><button onClick={() => setMode('check')}>Crear check desde equipo</button></div><Card title="Identificación"><InfoGrid items={[[ 'Código', data.code ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Ubicación', data.internal_location ?? '-' ], [ 'Fabricante', data.brand ?? '-' ], [ 'Modelo', data.model ?? '-' ], [ 'Serie', data.serial_number ?? '-' ], [ 'Estado', displayStatus(data.status) ], [ 'Criticidad', displayStatus(data.criticality) ]]} /></Card><div className="grid half"><Card title="Componentes"><CompactRows rows={(data.equipment_components ?? []).map((c: any) => [c.component_type, `${c.brand ?? '-'} ${c.model ?? ''} · ${c.status}`, severityForStatus(c.status), `/app/equipos/${id}`])} empty="Sin componentes." /></Card><Card title="Historial"><CompactRows rows={history.data.map((h: any) => [displayStatus(h.event_type), `${formatDate(h.event_at)} · ${h.summary ?? ''} · ${h.detail ?? ''}`, severityForStatus(h.detail), h.event_type === 'parte' ? '/app/partes' : `/app/equipos/${id}`])} empty="Sin historial." /></Card></div><Related title="Relaciones" groups={[['Documentos', data.document_links?.map((l: any) => l.documents), '/app/documentos'], ['Expedientes', data.cases, '/app/expedientes'], ['Partes', data.work_orders, '/app/partes'], ['Checks', data.checks, '/app/checks']]} />{mode === 'edit' && <EquipmentForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'component' && <ComponentForm equipmentId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ client_id: data.client_id, site_id: data.site_id, main_equipment_id: data.id }} onClose={() => setMode(null)} onSaved={(newId) => { setMode(null); if (newId) navigate(`/app/partes/${newId}`); }} />}{mode === 'check' && <CheckForm initial={{ equipment_id: data.id }} onClose={() => setMode(null)} onSaved={(newId) => { setMode(null); if (newId) navigate(`/app/checks/${newId}`); }} />}</section>; }

function CasesPage() { const { workspace } = useAuth(); const { companyId } = useSuperadminScope(); const scope = workspace === 'superadmin' ? companyId : undefined; const baseRoute = workspace === 'superadmin' ? '/app/superadmin/expedientes' : '/app/expedientes'; const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => casesService.list(search, scope), [search, scope], [] as any[]); const [creating, setCreating] = useState(false); return <>{workspace === 'superadmin' && <section className="page"><SuperadminCompanyScope /></section>}<ListPage title="Expedientes" summary="Expedientes con eventos y enlaces reales." search={search} setSearch={setSearch} action={<button className="primary" disabled={workspace === 'superadmin' && !companyId} onClick={() => setCreating(true)}>Crear expediente</button>} loading={loading} error={error} retry={reload} empty={!data.length}><WorkTable rows={data} columns={['code', 'title', 'clients.legal_name', 'status', 'priority']} route={baseRoute} />{creating && <CaseForm title="Crear expediente" initial={{ company_id: companyId }} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage></>; }

function CaseDetailPage({ forcedId }: { forcedId?: string } = {}) { const { id: routeId = '' } = useParams(); const { workspace } = useAuth(); const id = forcedId ?? routeId; const { data, loading, error, reload } = useLoad(() => casesService.get(id), [id], null as any); const [mode, setMode] = useState<'edit' | 'work' | null>(null); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; const baseRoute = workspace === 'superadmin' ? '/app/superadmin' : '/app'; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.title}`} subtitle={`${data.clients?.legal_name ?? ''} · ${displayStatus(data.status)}`} tone={severityForPriority(data.priority)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar expediente</button><button onClick={() => setMode('work')}>Crear parte</button>{data.client_id && <Link to={`${baseRoute}/clientes/${data.client_id}`}>Abrir cliente</Link>}{data.site_id && <Link to={`${baseRoute}/centros/${data.site_id}`}>Abrir centro</Link>}</div><Card title="Datos del expediente"><InfoGrid items={[[ 'Empresa', data.company_id ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Tipo', displayStatus(data.type) ], [ 'Prioridad', displayStatus(data.priority) ], [ 'Estado', displayStatus(data.status) ], [ 'Origen', data.origin ], [ 'Descripción', data.description ?? '-' ]]} /></Card><Card title="Cronología"><Timeline items={(data.case_events ?? []).map((event: any) => `${formatDate(event.created_at)} · ${event.event_type} · ${event.description ?? ''}`)} /></Card><Related title="Registros vinculados" groups={[[ 'Vínculos', data.case_links, baseRoute ], [ 'Documentos', data.case_documents, '/app/documentos' ]]} />{mode === 'edit' && <CaseForm title="Modificar expediente" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ company_id: data.company_id, case_id: data.id, client_id: data.client_id, site_id: data.site_id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>; }

function WorkOrdersPage() {
  const { profile, workspace } = useAuth();
  const { companyId } = useSuperadminScope();
  const scope = workspace === 'superadmin' ? companyId : undefined;
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(() => workOrderFilterFromParams(params));
  const [person, setPerson] = useState(params.get('tecnico') ?? '');
  const { data, loading, error, reload } = useLoad(() => workOrdersService.listWithAssignments(search, scope), [search, scope], [] as any[]);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const next = workOrderFilterFromParams(params); setFilter((current) => current === next ? current : next); }, [params]);
  const changeFilter = (next: string) => { setFilter(next); const updated = new URLSearchParams(params); ['estado', 'prioridad', 'filtro', 'fecha'].forEach((key) => updated.delete(key)); if (['sin-asignar','checks-pendientes','material','no-terminados'].includes(next)) updated.set('filtro', next); else if (next === 'en-curso') updated.set('estado', 'en-curso'); else if (next === 'finalizados') updated.set('estado', 'realizado'); else if (next === 'pendientes') updated.set('estado', 'pendiente'); else if (next === 'urgentes') updated.set('prioridad', 'critica'); else if (next === 'hoy') updated.set('fecha', 'hoy'); setParams(updated, { replace: true }); };
  const clearFilters = () => { setFilter('todos'); setPerson(''); const updated = new URLSearchParams(params); ['estado', 'prioridad', 'filtro', 'fecha', 'tecnico', 'vista'].forEach((key) => updated.delete(key)); setParams(updated, { replace: true }); };
  const people = Array.from(new Set(data.flatMap((work: any) => [...(work.assignments ?? []).map((item: any) => fullName(item.profiles)), work.commercial_name, work.creator_name].filter(Boolean)))).sort();
  const today = new Date().toISOString().slice(0, 10);
  const rows = data.filter((work: any) => {
    const assignedNames = (work.assignments ?? []).map((item: any) => fullName(item.profiles));
    const checks = work.checks ?? [];
    const byFilter = filter === 'todos' || (filter === 'sin-asignar' ? !(work.assignments ?? []).length && !work.main_technician_name : filter === 'checks-pendientes' ? checks.some((check: any) => check.status !== 'Realizado') : filter === 'material' ? Boolean(work.planned_material) : filter === 'no-terminados' ? work.scheduled_date < today && !['Enviado','Cerrado','Cancelado'].includes(work.status) : filter === 'en-curso' ? ['En desplazamiento','En intervencion','Pausado','Pendiente de envio'].includes(work.status) : filter === 'finalizados' ? ['Finalizado tecnicamente','Enviado','Cerrado'].includes(work.status) : filter === 'pendientes' ? !['Finalizado tecnicamente','Enviado','Cerrado','Cancelado'].includes(work.status) : filter === 'urgentes' ? ['Alta','Critica'].includes(work.priority) : filter === 'hoy' ? work.scheduled_date === today : work.status === filter);
    const byPerson = !person || assignedNames.includes(person) || work.main_technician_name === person || work.commercial_name === person || work.creator_name === person || (work.assignments ?? []).some((item: any) => item.technician_id === person || item.profiles?.id === person);
    return byFilter && byPerson;
  });
  return <>{workspace === 'superadmin' && <section className="page"><SuperadminCompanyScope /></section>}<ListPage title="Partes" summary="Partes SAT con técnicos, comerciales, checks y carga de trabajo asociada." search={search} setSearch={setSearch} action={canCreateWorkOrder(profile) ? <button className="primary" disabled={workspace === 'superadmin' && !companyId} onClick={() => setCreating(true)}>Crear parte</button> : null} loading={loading} error={error} retry={reload} empty={!rows.length}><div className="filters sat-filters"><FormSelect label="Filtro" value={filter} onChange={changeFilter} options={[['todos','Todos'],['sin-asignar','Sin asignar'],['checks-pendientes','Checks pendientes'],['material','Material pendiente'],['no-terminados','No terminados'],['en-curso','En curso'],['finalizados','Finalizados'],['pendientes','Pendientes operativos'],['urgentes','Alta o crítica'],['hoy','Hoy']].map(([value, label]) => ({ value, label }))} /><FormSelect label="Técnico o comercial" value={person} onChange={(value) => { setPerson(value); const updated = new URLSearchParams(params); value ? updated.set('tecnico', value) : updated.delete('tecnico'); setParams(updated, { replace: true }); }} options={[...data.flatMap((work: any) => (work.assignments ?? []).map((item: any) => ({ value: item.profiles?.id ?? fullName(item.profiles), label: fullName(item.profiles) }))), ...people.map((name) => ({ value: name, label: name }))].filter((item, index, all) => item.value && all.findIndex((other) => other.value === item.value) === index)} /><button className="link-button" onClick={clearFilters}>Limpiar filtros</button></div><div className="sat-work-list">{rows.map((work: any) => <SatWorkOrderCard key={work.id} work={work} />)}</div>{workspace === 'sat' && rows.length === 0 && <p className="large-note">No hay partes para este filtro. Cambia el filtro o la búsqueda.</p>}{creating && <WorkOrderForm initial={{ company_id: companyId }} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage></>;
}

function SatWorkOrderCard({ work }: { work: any }) {
  const { workspace } = useAuth();
  const assignments = work.assignments ?? [];
  const principal = assignments.find((item: any) => item.role === 'Principal')?.profiles;
  const support = assignments.filter((item: any) => item.role !== 'Principal').map((item: any) => fullName(item.profiles)).filter(Boolean);
  const checks = work.checks ?? [];
  const load = `${checks.filter((check: any) => check.status !== 'Realizado').length} checks pendientes · ${assignments.length} asignaciones`;
  return <article className="sat-work-card"><header><div><strong>{work.code} · {work.title}</strong><span>{work.client_name} · {work.site_name} · {work.equipment_code ?? 'Sin equipo'}</span></div><Badge tone={severityForStatus(work.status)}>{displayStatus(work.status)}</Badge></header><div className="sat-assignment-grid"><div><small>Técnico principal</small><b>{principal ? fullName(principal) : work.main_technician_name ?? 'Sin asignar'}</b></div><div><small>Técnicos de apoyo</small><b>{support.length ? support.join(', ') : 'Sin apoyo'}</b></div><div><small>Comercial</small><b>{work.commercial_name ?? work.creator_name ?? 'No informado'}</b></div><div><small>Carga</small><b>{load}</b></div></div><div className="sat-checks"><strong>Checks asignados</strong>{checks.length ? checks.map((check: any) => <span key={check.id}>{check.code} · {fullName(check.profiles) || 'Sin técnico'} · {displayStatus(check.status)} · {displayStatus(check.global_result)}</span>) : <span>Sin checks vinculados</span>}</div><footer><span>{work.scheduled_date ?? 'Sin fecha'} · {work.scheduled_time ?? 'Sin hora'} · Prioridad {displayStatus(work.priority ?? 'Normal')}</span><Link className="primary" to={`${workspace === 'superadmin' ? '/app/superadmin/partes' : '/app/partes'}/${work.id}`}>Abrir</Link></footer></article>;
}

function WorkOrderDetailPageLegacyOriginal() { const { id = '' } = useParams(); const { profile, workspace } = useAuth(); const { data, loading, error, reload } = useLoad(() => workspace === 'tecnico' ? workOrdersService.getTechnicianAssigned(id) : workOrdersService.get(id), [id, workspace], null as any); const [mode, setMode] = useState<'edit' | 'assign' | 'check' | null>(null); const [message, setMessage] = useState(''); const [actionError, setActionError] = useState(''); if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />; if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; if (!canViewWorkOrder(profile, data)) return workspace === 'tecnico' ? <AccessDenied /> : <StateBlock loading={false} error="No tienes permiso para acceder a este parte" retry={undefined} empty={false} />; const previous = previousWorkOrderStatus(data.status); const adminActions = canEditWorkOrder(profile); const assignmentAllowed = canAssignTechnician(profile); const workAllowed = canExecuteWorkOrder(profile); const checkAllowed = canCreateCheck(profile); const advance = async () => { if (!workAllowed) return; try { setActionError(''); await workOrdersService.changeStatus(data.id, nextWorkOrderStatus(data.status), 'Cambio operativo desde el parte'); setMessage('Estado actualizado y persistido.'); reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido cambiar el estado.'); } }; const goBack = async () => { if (!previous || !workAllowed) return; const reason = window.prompt('Motivo de la corrección de estado'); if (!reason) return; try { setActionError(''); await workOrdersService.changeStatus(data.id, previous, reason, true); setMessage('Estado anterior restaurado conservando historial.'); reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido restaurar el estado.'); } }; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.title}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><p className="state-warning"><CheckCircle2 size={17} /> Estado actual del parte: {displayStatus(data.status)}</p><div className="actions">{adminActions && <button onClick={() => setMode('edit')}>Modificar parte</button>}{assignmentAllowed && <button onClick={() => setMode('assign')}>Asignar técnico</button>}{workAllowed && <button onClick={advance}>Avanzar estado</button>}{workAllowed && <button disabled={!previous} onClick={goBack}>Volver al estado anterior</button>}{checkAllowed && <button onClick={() => setMode('check')}>Crear check</button>}{data.main_equipment_id && <Link to={`/app/equipos/${data.main_equipment_id}`}>Abrir equipo</Link>}</div>{workspace === 'tecnico' && <p className="large-note">Vista técnica: solo se permiten acciones operativas del trabajo asignado. La edición administrativa y la asignación de técnicos están bloqueadas.</p>}{message && <p className="state-warning">{message}</p>}{actionError && <p className="form-error">{actionError}</p>}<div className="grid two-one"><Card title="Datos principales"><InfoGrid items={[[ 'Expediente', data.cases?.code ?? '-' ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Equipo', data.equipment?.code ?? '-' ], [ 'Tipo', displayStatus(data.type) ], [ 'Prioridad', displayStatus(data.priority) ], [ 'Estado', displayStatus(data.status) ], [ 'Fecha', data.scheduled_date ?? '-' ], [ 'Hora', data.scheduled_time ?? '-' ], [ 'Duración', data.estimated_duration_minutes ? `${data.estimated_duration_minutes} min` : '-' ], [ 'Material previsto', data.planned_material ?? '-' ], [ 'Descripción', data.description ?? '-' ]]} /></Card><Card title="Asignaciones"><CompactRows rows={(data.work_order_assignments ?? []).map((a: any) => [fullName(a.profiles), `${a.assignment_date} · ${a.planned_start_time ?? '-'} · ${a.status}`, severityForStatus(a.status), `/app/partes/${id}`])} empty="Sin técnico asignado." /></Card></div><Card title="Historial de estados"><Timeline items={(data.work_order_status_history ?? []).map((h: any) => `${formatDate(h.changed_at)} · ${displayStatus(h.previous_status)} -> ${displayStatus(h.new_status)} · ${h.reason ?? ''}`)} /></Card><Related title="Relaciones" groups={[[ 'Checks', data.checks, '/app/checks' ], [ 'Deficiencias', data.deficiencies, '/app/deficiencias' ], [ 'Materiales', data.work_order_materials, '/app/partes' ]]} />{mode === 'edit' && <WorkOrderForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'assign' && <AssignmentForm workOrderId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'check' && <CheckForm initial={{ work_order_id: data.id, equipment_id: data.main_equipment_id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>; }

function WorkOrderDetailPageV2({ forcedId }: { forcedId?: string } = {}) {
  const { id: routeId = '' } = useParams();
  const id = forcedId ?? routeId;
  const { profile, workspace } = useAuth();
  const { data, loading, error, reload } = useLoad(() => workspace === 'tecnico' ? workOrdersService.getTechnicianAssigned(id) : workOrdersService.get(id), [id, workspace], null as any);
  const [mode, setMode] = useState<'edit' | 'assign' | 'check' | null>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />;
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  if (!canViewWorkOrder(profile, data)) return workspace === 'tecnico' ? <AccessDenied /> : <StateBlock loading={false} error="No tienes permiso para acceder a este parte" retry={undefined} empty={false} />;
  const summary = interventionSummary(data);
  const activity = activityTimeline(data);
  const previous = previousWorkOrderStatus(data.status);
  const advance = async () => { if (!canExecuteWorkOrder(profile)) return; try { setActionError(''); await workOrdersService.changeStatus(data.id, nextWorkOrderStatus(data.status), 'Cambio operativo desde el parte'); setMessage('Estado actualizado y persistido.'); reload(); } catch (err) { setActionError(err instanceof Error ? err.message : 'No se ha podido cambiar el estado.'); } };
  const goBack = async () => { if (!previous || !canExecuteWorkOrder(profile)) return; const reason = window.prompt('Motivo de la corrección de estado'); if (!reason) return; try { setActionError(''); await workOrdersService.changeStatus(data.id, previous, reason, true); setMessage('Estado anterior restaurado conservando historial.'); reload(); } catch (err) { setActionError(err instanceof Error ? err.message : 'No se ha podido restaurar el estado.'); } };
  return <section className="page work-detail"><BackButton /><div className="work-summary"><div><p className="eyebrow">Ficha completa del parte</p><h2>{data.code} · {data.title}</h2><p>{data.clients?.legal_name ?? 'Cliente no informado'} · {data.sites?.name ?? 'Centro no informado'} · {data.primary_equipment?.code ?? 'Sin equipo'} · {equipmentTypeName(data.primary_equipment) ?? 'Tipo de equipo no disponible'}</p></div><Badge tone={severityForStatus(data.status)}>{displayStatus(data.status)}</Badge></div><div className="actions">{canEditWorkOrder(profile) && <button onClick={() => setMode('edit')}>Modificar parte</button>}{canAssignTechnician(profile) && <button onClick={() => setMode('assign')}>Asignar técnico</button>}{canExecuteWorkOrder(profile) && <button onClick={advance}>Avanzar estado</button>}{canExecuteWorkOrder(profile) && <button disabled={!previous} onClick={goBack}>Volver estado</button>}{canCreateCheck(profile) && <button onClick={() => setMode('check')}>Crear check</button>}<SyncButton workOrderId={data.id} onSynced={reload} />{data.main_equipment_id && <Link to={`/app/equipos/${data.main_equipment_id}`}>Abrir/corregir equipo</Link>}</div>{message && <p className="success-note">{message}</p>}{actionError && <p className="form-error">{actionError}</p>}<div className="stats-grid"><Card title="Resumen"><InfoGrid items={[[ 'Estado', displayStatus(data.status) ], [ 'Prioridad', displayStatus(data.priority) ], [ 'Técnico principal', fullName(data.primary_technician) ], [ 'Apoyos', (data.support_technicians ?? []).map(fullName).join(', ') || '-' ], [ 'Fecha/hora', `${data.scheduled_date ?? '-'} ${data.scheduled_time ?? ''}` ], [ 'Resultado', summary.result ?? '-' ]]}/></Card><Card title="Contadores"><InfoGrid items={[[ 'Fotos', String((data.photos ?? []).length) ], [ 'Firmas', String((data.signatures ?? []).length) ], [ 'Checks', String((data.checks ?? []).length) ], [ 'Materiales', String((data.materials ?? []).length) ], [ 'Última sincronización', summary.syncedAt ? formatDate(summary.syncedAt) : '-' ], [ 'Estado remoto', 'Sincronizado en Supabase' ]]}/></Card></div><WorkProgress history={data.status_history ?? []} current={data.status} /><Card title="Resumen de intervención"><InfoGrid items={[[ 'Diagnóstico', summary.diagnosis ?? '-' ], [ 'Trabajo realizado', summary.work ?? '-' ], [ 'Observaciones', summary.observations ?? '-' ], [ 'Material previsto', data.planned_material ?? '-' ], [ 'Materiales usados', (data.materials ?? []).map((item: any) => `${item.description ?? item.materials?.name ?? 'Material'} · ${item.quantity ?? 1} ${item.unit ?? ''}`).join(' / ') || '-' ], [ 'Fecha sincronización', summary.syncedAt ? formatDate(summary.syncedAt) : '-' ]]}/></Card><Card title={`Checks (${(data.checks ?? []).length})`}><div className="work-detail-list">{(data.checks ?? []).map((check: any) => <CheckSummaryCard key={check.id} check={check} />)}{!(data.checks ?? []).length && <p className="large-note">Sin checks asociados.</p>}</div></Card><MediaGallery photos={data.photos ?? []} signatures={data.signatures ?? []} /><Card title={`Materiales (${(data.materials ?? []).length})`}><CompactRows rows={(data.materials ?? []).map((item: any) => [item.description ?? item.materials?.name ?? 'Material usado', `${item.quantity ?? 1} ${item.unit ?? ''} · ${formatDate(item.created_at)}`, 'info', `/app/partes/${data.id}`])} empty="Sin materiales usados sincronizados." /></Card><Card title="Actividad"><div className="work-detail-list">{activity.map((item, index) => <article key={`${item.type}-${item.date}-${index}`}><Badge tone="info">{item.type}</Badge><p><strong>{item.title}</strong><br /><small>{formatDate(item.date)} · {item.author ?? 'Autor no informado'}</small><br />{item.text ?? ''}</p></article>)}{!activity.length && <p className="large-note">Sin actividad registrada.</p>}</div></Card>{mode === 'edit' && <WorkOrderForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'assign' && <AssignmentForm workOrderId={data.id} companyId={data.company_id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'check' && <CheckForm initial={{ work_order_id: data.id, company_id: data.company_id, equipment_id: data.main_equipment_id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>;
}

function WorkProgress({ history, current }: { history: any[]; current: string }) {
  const steps = ['Pendiente', 'Asignado', 'En desplazamiento', 'En intervencion', 'Finalizado tecnicamente', 'Pendiente de envio', 'Enviado'];
  return <Card title="Progreso del trabajo"><div className="work-progress">{steps.map((step) => { const item = history.find((row) => row.new_status === step); const done = item || step === current; return <article key={step} className={done ? 'done' : ''}><strong>{displayStatus(step)}</strong><small>{item ? `${formatDate(item.changed_at)} · ${fullName(item.profiles) || 'Usuario no informado'}` : step === current ? 'Estado actual' : 'Pendiente'}</small></article>; })}</div></Card>;
}

function CheckSummaryCard({ check }: { check: any }) {
  const blocks = buildFunctionalCheckBlocks(check);
  const reviewed = blocks.filter((block) => block.result && normalizeCheckStatus(block.result.result) !== 'Sin revisar').length;
  const route = `/app/checks/${check.id}`;
  return <article className="check-summary-card"><div><strong>{check.code} · {check.check_templates?.name ?? 'Plantilla no informada'}</strong><small>{check.equipment?.code ?? 'Equipo'} · {equipmentTypeName(check.equipment) ?? 'Tipo de equipo no disponible'} · {reviewed}/{blocks.length} secciones · {(check.check_photos ?? []).length} fotos</small>{templateTypeMismatch(check) && <p className="form-error">La plantilla no coincide con el tipo del equipo.</p>}</div><Badge tone={severityForStatus(check.global_result)}>{displayStatus(check.global_result ?? check.status)}</Badge><Link to={route}>Ver check completo</Link></article>;
}

function MediaGallery({ photos, signatures }: { photos: any[]; signatures: any[] }) {
  return <div className="grid half"><Card title={`Fotos (${photos.length})`}><div className="media-grid">{photos.map((photo) => photo.signed_url ? <a key={photo.id} href={photo.signed_url} target="_blank" rel="noreferrer"><img src={photo.signed_url} alt={photo.description ?? photo.files?.name ?? 'Foto del parte'} /><strong>{photo.description ?? photo.files?.name ?? 'Foto del parte'}</strong><small>{formatDate(photo.taken_at ?? photo.created_at)} · {fullName(photo.profiles) || 'Autor no informado'}</small></a> : <article key={photo.id} className="media-error"><strong>{photo.description ?? photo.files?.name ?? 'Foto del parte'}</strong><p className="form-error">{photo.file_error ?? 'No se ha podido cargar el archivo'}</p></article>)}{!photos.length && <p className="large-note">Sin fotos sincronizadas.</p>}</div></Card><Card title={`Firmas (${signatures.length})`}><div className="media-grid">{signatures.map((signature) => signature.signed_url ? <a key={signature.id} href={signature.signed_url} target="_blank" rel="noreferrer"><img src={signature.signed_url} alt={`Firma de ${signature.signer_name}`} /><strong>{signature.signer_name}</strong><small>{signature.signer_role ?? 'Rol no informado'} · {maskDocument(signature.signer_document)} · {formatDate(signature.signed_at)}</small><small>{signature.accepted_terms ? 'Aceptación registrada' : 'Aceptación no registrada'}</small></a> : <article key={signature.id} className="media-error"><strong>{signature.signer_name ?? 'Firma'}</strong><p className="form-error">{signature.file_error ?? 'No se ha podido cargar el archivo'}</p></article>)}{!signatures.length && <p className="large-note">Sin firmas sincronizadas.</p>}</div></Card></div>;
}
function AccessDenied() { return <section className="page"><Card title="Sin permiso"><p className="form-error">No tienes permiso para acceder a este trabajo</p><Link className="primary" to="/app/tecnico">Volver a Mi jornada</Link></Card></section>; }
function AccessDeniedZone() { const { workspace, signOut } = useAuth(); const home = homeForWorkspace(workspace); return <section className="page"><Card title="No tienes permiso para acceder a esta zona"><p className="form-error">No tienes permiso para acceder a esta zona</p><div className="actions"><Link className="primary" to={home}>{workspace === 'tecnico' ? 'Volver a Mi jornada' : workspace === 'superadmin' ? 'Volver a Superadmin' : 'Volver al inicio'}</Link><button onClick={() => signOut()}>Cerrar sesión</button></div></Card></section>; }

function useOfflineQueue(scope?: { workOrderId?: string; checkId?: string }) {
  const [pending, setPending] = useState<any[]>([]);
  const reload = async () => setPending(scope?.checkId ? await technicianOfflineService.pendingForCheck(scope.checkId) : scope?.workOrderId ? await technicianOfflineService.pendingForWorkOrder(scope.workOrderId) : await technicianOfflineService.pending());
  useEffect(() => { reload(); window.addEventListener('dmp-offline-queue-changed', reload); return () => window.removeEventListener('dmp-offline-queue-changed', reload); }, [scope?.workOrderId, scope?.checkId]);
  return { pending, summary: technicianOfflineService.summarize(pending), reload };
}

function SyncButton({ workOrderId, checkId, onSynced }: { workOrderId?: string; checkId?: string; onSynced?: () => void }) {
  const { pending, summary, reload } = useOfflineQueue({ workOrderId, checkId });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const sync = async () => {
    if (!pending.length || syncing) return;
    setSyncing(true); setMessage(`Pendientes: ${summary.pending}. Fallidos reintentables: ${summary.failed}. Bloques: ${summary.blocks}. Incidencias: ${summary.incidences}. Fotos: ${summary.photos}. Materiales: ${summary.materials}. Firmas: ${summary.signatures}.`);
    const result = await technicianOfflineService.sync(setMessage, { workOrderId, checkId });
    setMessage(`Sincronizados: ${result.synced}. Fallidos: ${result.failed}. Pendientes: ${result.pending}.`);
    setSyncing(false); reload(); onSynced?.();
  };
  return <div className="sync-box"><button className="primary" disabled={!pending.length || syncing} onClick={sync}>{syncing ? 'Sincronizando...' : `Sincronizar (${pending.length})`}</button>{pending.length > 0 && <Link to="/app/pendientes">Ver pendientes</Link>}{message && <p>{message}</p>}</div>;
}

function PendingSyncPage() {
  const { pending, summary, reload } = useOfflineQueue();
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const sync = async () => { setSyncing(true); const result = await technicianOfflineService.sync(setMessage); setMessage(`Sincronizados: ${result.synced}. Fallidos: ${result.failed}. Quedan por enviar: ${result.pending}.`); setSyncing(false); reload(); };
  const retryOne = async (changeId: string) => { setSyncing(true); const result = await technicianOfflineService.syncOne(changeId, setMessage); setMessage(`Fila sincronizada: ${result.synced}. Fallidos: ${result.failed}.`); setSyncing(false); reload(); };
    return <section className="page technician-page"><BackButton /><div className="page-head"><div><h2>Pendientes de sincronizar</h2><p>Datos técnicos guardados en este dispositivo hasta que Supabase confirme la sincronización.</p></div><button className="primary" disabled={!pending.length || syncing} onClick={sync}>{syncing ? 'Sincronizando...' : 'Sincronizar todo'}</button></div><Card title="Resumen"><InfoGrid items={[[ 'Total por enviar', summary.total ], [ 'Pendientes', summary.pending ], [ 'Bloqueados', summary.blocked ], [ 'Fallidos', summary.failed ], [ 'Sincronizados ahora', message.match(/Sincronizados: (\d+)/)?.[1] ?? '0' ], [ 'Bloques', summary.blocks ], [ 'Incidencias', summary.incidences ], [ 'Materiales', summary.materials ], [ 'Fotos', summary.photos ], [ 'Firmas', summary.signatures ]]} />{message && <p className="success-note">{message}</p>}</Card><div className="compact-list">{pending.map((item) => <article key={item.id}><Badge tone={item.status === 'failed' ? 'danger' : item.status === 'blocked' ? 'warn' : 'info'}>{item.status === 'failed' ? 'Fallido' : item.status === 'blocked' ? 'Bloqueado' : item.status === 'syncing' ? 'Sincronizando' : 'Pendiente'}</Badge><p><strong>{displayStatus(item.type)}</strong><br /><small>Parte: {item.workOrderId ?? '-'} · Check: {item.checkId ?? '-'} · Bloque: {item.blockId ?? '-'}</small><br /><small>Fecha: {formatDate(item.updatedAt)} · Intentos: {item.attempts ?? 0}</small></p>{item.error && <p className="form-error">{item.error}</p>}<button onClick={() => retryOne(item.id)} disabled={syncing}>Reintentar esta fila</button></article>)}</div>{!pending.length && <Card title="Sin pendientes"><p className="large-note">No hay cambios locales pendientes, fallidos o bloqueados.</p></Card>}</section>;
}

function TechnicianDayPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'hoy' | 'anteriores' | 'urgentes' | 'curso' | 'finalizados' | 'checks' | 'sin-hora'>('hoy');
  const { data, loading, error, reload } = useLoad(() => assignmentsService.assignedWork(), [], [] as any[]);
  const { pending } = useOfflineQueue();
  const today = new Date().toISOString().slice(0, 10);
  const rows = data.filter((row) => tab === 'hoy' ? row.assignment_date === today : tab === 'anteriores' ? row.assignment_date < today && !['Enviado','Cerrado','Cancelado'].includes(row.work_order_status) : tab === 'urgentes' ? ['Alta','Critica'].includes(row.priority) : tab === 'curso' ? ['En desplazamiento','En intervencion','Finalizado tecnicamente','Pendiente de envio'].includes(row.work_order_status) : tab === 'finalizados' ? ['Enviado','Cerrado'].includes(row.work_order_status) : tab === 'checks' ? Number(row.pending_checks_count ?? 0) > 0 || (row.check_status && row.check_status !== 'Realizado') : !row.planned_start_time);
  return <section className="page technician-page"><div className="page-head"><div><p className="eyebrow">Trabajo técnico</p><h2>Mi jornada</h2><p>Solo partes asignados como técnico principal o de apoyo.</p></div><SyncButton /></div><div className="tabs">{[['hoy','Hoy'],['anteriores','Pendientes anteriores'],['urgentes','Urgentes'],['curso','En curso'],['finalizados','Finalizados'],['checks','Checks pendientes'],['sin-hora','Sin hora']].map(([key, label]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key as any)}>{label}</button>)}</div><StateBlock loading={loading} error={error} retry={reload} empty={!rows.length}>{rows.map((work) => { const local = pending.filter((item) => item.workOrderId === work.work_order_id).length; const pendingChecks = Number(work.pending_checks_count ?? (work.check_status && work.check_status !== 'Realizado' ? 1 : 0)); return <article className="journey-card" key={work.assignment_id ?? `${work.work_order_id}-${work.assignment_date}-${work.technician_id}`}><div><strong>{work.planned_start_time ?? 'Sin hora'} · {work.code ?? work.work_order_code} · {work.title}</strong><span>{displayStatus(work.work_order_status)} · Prioridad {displayStatus(work.priority ?? 'Normal')}</span><span>{work.client_name} · {work.site_name}</span><span>{work.site_address ?? work.address ?? 'Dirección no informada'}</span><span>{work.equipment_code ?? 'Sin equipo'} · {displayStatus(work.type ?? 'Trabajo técnico')}</span><p>{work.description ?? work.work_order_description ?? 'Sin descripción breve.'}</p><small>Acceso: {work.access_description ?? work.access_requirements ?? 'No informado'} · Material previsto: {work.planned_material ?? 'No informado'}</small></div><div><Badge tone={severityForStatus(work.work_order_status)}>{displayStatus(work.work_order_status)}</Badge>{pendingChecks > 0 && <small>{pendingChecks} check(s) pendiente(s)</small>}{local > 0 && <Badge tone="warn">{local} cambios locales</Badge>}<button className="primary" onClick={() => navigate(`/app/tecnico/trabajo/${work.work_order_id}`)}>Abrir trabajo</button></div></article>; })}</StateBlock></section>;
}

function TechnicianWorkPage() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const { data, loading, error, reload } = useLoad(() => workOrdersService.getTechnicianAssigned(id), [id], null as any);
  const [message, setMessage] = useState('');
  if (loading) return <StateBlock loading={loading} retry={reload} empty={false} />;
  if (error || !data) return <section className="page"><Card title="Sin permiso"><p className="form-error">No tienes permiso para acceder a este parte</p><Link className="primary" to="/app/tecnico">Volver a Mi jornada</Link></Card></section>;
  if (!canViewWorkOrder(profile, data)) return <section className="page"><Card title="Sin permiso"><p className="form-error">No tienes permiso para acceder a este parte</p><Link className="primary" to="/app/tecnico">Volver a Mi jornada</Link></Card></section>;
  const advance = async (status: string) => { await workOrdersService.changeStatus(data.id, status, 'Cambio operativo desde modo técnico'); setMessage(`Estado actualizado: ${displayStatus(status)}`); reload(); };
  return <section className="page technician-page"><BackButton /><Hero title={`${data.code} · ${data.title}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><p className="state-warning"><CheckCircle2 size={17} /> Estado actual del parte: {displayStatus(data.status)}</p>{message && <p className="success-note">{message}</p>}<div className="actions"><button onClick={() => advance(nextWorkOrderStatus(data.status))}>Iniciar / avanzar</button><button onClick={() => advance('Pausado')}>Pausar</button><button onClick={() => advance('Finalizado tecnicamente')}>Finalizar técnicamente</button><SyncButton workOrderId={id} /></div><div className="grid half"><Card title="Datos para la intervención"><InfoGrid items={[[ 'Prioridad', displayStatus(data.priority) ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Dirección', data.sites?.address ?? '-' ], [ 'Equipo principal', data.primary_equipment?.code ?? '-' ], [ 'Tipo de trabajo', displayStatus(data.type) ], [ 'Horario', `${data.scheduled_date ?? '-'} ${data.scheduled_time ?? ''}` ], [ 'Acceso', data.access_requirement?.description ?? '-' ], [ 'Material previsto', data.planned_material ?? '-' ], [ 'Descripción', data.description ?? '-' ]]}/></Card><Card title="Checks vinculados"><CompactRows rows={(data.checks ?? []).map((check: any) => [check.code, `${check.equipment?.code ?? 'Equipo'} · ${displayStatus(check.status)} · ${displayStatus(check.global_result)}`, severityForStatus(check.global_result), `/app/checks/${check.id}`])} empty="Sin checks vinculados." /></Card></div><div className="grid half"><TechnicianLocalForm workOrderId={id} type="work-note" title="Diagnóstico e intervención" fields={[['diagnosis','Diagnóstico'],['work','Trabajo realizado'],['observations','Observaciones']]} /><TechnicianLocalForm workOrderId={id} type="material" title="Materiales usados" fields={[['material','Material'],['quantity','Cantidad'],['observations','Observación']]} /><WorkOrderPhotoForm workOrderId={id} /><WorkOrderDeficiencyForm workOrderId={id} checks={data.checks ?? []} /><WorkOrderSignatureForm workOrderId={id} /></div><Card title="Historial técnico"><Timeline items={(data.status_history ?? []).map((item: any) => `${formatDate(item.changed_at)} · ${displayStatus(item.new_status)} · ${item.reason ?? ''}`)} /></Card></section>;
}

function TechnicianLocalForm({ workOrderId, type, title, fields }: any) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const save = async () => { await technicianOfflineService.upsert({ type, workOrderId, payload: values }); setMessage('Guardado en dispositivo. Pendiente de sincronizar.'); };
  return <Card title={title}>{fields.map(([key, label]: any[]) => <label key={key}>{label}<textarea value={values[key] ?? ''} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}<button className="primary wide" onClick={save}>Guardar localmente</button>{message && <p className="success-note">{message}</p>}</Card>;
}

function WorkOrderPhotoForm({ workOrderId }: { workOrderId: string }) {
  const [message, setMessage] = useState('');
  const save = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const photos = await Promise.all(Array.from(files).map(fileToLocalPhoto));
      await Promise.all(photos.map((photo) => technicianOfflineService.upsert({ type: 'photo', workOrderId, payload: photo })));
      setMessage(`${photos.length} foto(s) guardada(s) en el dispositivo.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se ha podido guardar la foto localmente.');
    }
  };
  return <Card title="Fotos del parte"><label className="component-photo">Añadir foto real<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple onChange={(event) => save(event.target.files)} /></label>{message && <p className={message.includes('guardada') ? 'success-note' : 'form-error'}>{message}</p>}</Card>;
}

function WorkOrderDeficiencyForm({ workOrderId, checks }: { workOrderId: string; checks: any[] }) {
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('Media');
  const [component, setComponent] = useState('');
  const [recommendedAction, setRecommendedAction] = useState('');
  const [checkId, setCheckId] = useState('');
  const [blockId, setBlockId] = useState('');
  const [message, setMessage] = useState('');
  const save = async () => {
    const text = description.trim();
    if (!text) { setMessage('La descripción de la incidencia es obligatoria.'); return; }
    await technicianOfflineService.upsert({ type: 'deficiency', workOrderId, checkId: checkId || undefined, blockId: blockId || undefined, payload: { id: crypto.randomUUID(), description: text, severity, component: component.trim() || null, recommendedAction: recommendedAction.trim() || null, checkId: checkId || null, blockId: blockId || null } });
    setDescription(''); setComponent(''); setRecommendedAction(''); setBlockId(''); setMessage('Incidencia guardada en dispositivo. Pendiente de sincronizar.');
  };
  return <Card title="Incidencia / deficiencia"><label>Descripción obligatoria<textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label><FormSelect label="Gravedad" value={severity} onChange={setSeverity} options={['Baja','Media','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /><label>Componente<input value={component} onChange={(event) => setComponent(event.target.value)} placeholder="Componente afectado" /></label><label>Acción recomendada<textarea value={recommendedAction} onChange={(event) => setRecommendedAction(event.target.value)} /></label><FormSelect label="Check asociado opcional" value={checkId} onChange={setCheckId} options={[{ value: '', label: 'Sin check asociado' }, ...checks.map((check: any) => ({ value: check.id, label: `${check.code ?? 'Check'} · ${check.equipment?.code ?? 'Equipo'}` }))]} /><label>Bloque asociado opcional<input value={blockId} onChange={(event) => setBlockId(event.target.value)} placeholder="Ej. hoja, motor, guías" /></label><button className="primary wide" type="button" onClick={save}>Guardar incidencia local</button>{message && <p className={message.includes('obligatoria') ? 'form-error' : 'success-note'}>{message}</p>}</Card>;
}

function WorkOrderSignatureForm({ workOrderId }: { workOrderId: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [signerName, setSignerName] = useState('');
  const [signerDocument, setSignerDocument] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState('');
  const point = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * (event.currentTarget.width / rect.width), y: (event.clientY - rect.top) * (event.currentTarget.height / rect.height) };
  };
  const start = (event: PointerEvent<HTMLCanvasElement>) => { event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; const ctx = event.currentTarget.getContext('2d'); const p = point(event); ctx?.beginPath(); ctx?.moveTo(p.x, p.y); };
  const draw = (event: PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = event.currentTarget.getContext('2d'); const p = point(event); if (ctx) { ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827'; ctx.lineTo(p.x, p.y); ctx.stroke(); } };
  const clear = () => { const canvas = canvasRef.current; canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height); };
  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !signerName.trim()) { setMessage('Indica el nombre de la persona firmante.'); return; }
    if (!accepted) { setMessage('La aceptación expresa es obligatoria antes de guardar la firma.'); return; }
    if (!canvasHasInk(canvas)) { setMessage('Dibuja la firma en el recuadro antes de guardarla.'); return; }
    await technicianOfflineService.upsert({ type: 'signature', workOrderId, payload: { dataUrl: canvas.toDataURL('image/png'), signerName, signerDocument, signerRole: 'Cliente', acceptedTerms: accepted } });
    setMessage('Firma guardada en dispositivo. Pendiente de sincronizar.');
  };
  return <Card title="Firma del cliente"><label>Nombre firmante<input value={signerName} onChange={(event) => setSignerName(event.target.value)} /></label><label>Documento<input value={signerDocument} onChange={(event) => setSignerDocument(event.target.value)} /></label><canvas ref={canvasRef} width={520} height={180} className="signature-pad" onPointerDown={start} onPointerMove={draw} onPointerUp={() => { drawing.current = false; }} onPointerCancel={() => { drawing.current = false; }} onPointerLeave={() => { drawing.current = false; }} /><label className="check-consent"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /> Acepto expresamente el contenido del parte y la firma capturada.</label><div className="actions"><button type="button" onClick={clear}>Limpiar firma</button><button type="button" className="primary" onClick={save}>Guardar firma local</button></div>{message && <p className={message.includes('guardada') ? 'success-note' : 'form-error'}>{message}</p>}</Card>;
}

function ChecksPage() { const { profile, workspace } = useAuth(); const { companyId } = useSuperadminScope(); const scope = workspace === 'superadmin' ? companyId : undefined; const [tab, setTab] = useState<'pending' | 'done'>('pending'); const loader = () => workspace === 'tecnico' ? (tab === 'pending' ? checksService.pendingForCurrentTechnician() : checksService.completedForCurrentTechnician()) : (tab === 'pending' ? checksService.pending(scope) : checksService.completed(scope)); const { data, loading, error, reload } = useLoad(loader, [tab, workspace, scope], [] as any[]); const [creating, setCreating] = useState(false); return <section className="page">{workspace === 'superadmin' && <SuperadminCompanyScope />}<div className="page-head"><div><h2>Checks</h2><p>{workspace === 'tecnico' ? 'Checks asignados al técnico autenticado.' : 'Por realizar y realizados con datos reales.'}</p></div>{canCreateCheck(profile) && workspace !== 'tecnico' && <button className="primary" disabled={workspace === 'superadmin' && !companyId} onClick={() => setCreating(true)}>Crear check</button>}</div><div className="tabs"><button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Por realizar</button><button className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>Realizados</button></div><StateBlock loading={loading} error={error} retry={reload} empty={!data.length}><WorkTable rows={data} columns={['code', 'equipment_code', 'work_order_code', 'status', 'global_result']} route={workspace === 'superadmin' ? '/app/superadmin/checks' : '/app/checks'} /></StateBlock>{creating && <CheckForm initial={{ company_id: companyId }} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</section>; }

function CheckDetailPage({ forcedId }: { forcedId?: string } = {}) {
  const { id: routeId = '' } = useParams();
  const { profile, workspace } = useAuth();
  const id = forcedId ?? routeId;
  const { data, loading, error, reload } = useLoad(() => workspace === 'tecnico' ? checksService.getTechnicianAssigned(id) : checksService.get(id), [id, workspace], null as any);
  const [mode, setMode] = useState<'finish' | 'edit' | null>(null);
  const [actionError, setActionError] = useState('');
  const { pending } = useOfflineQueue({ checkId: id });
  if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />;
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  if (!canViewCheck(profile, data)) return <AccessDenied />;
  const template = visualTemplateForEquipment(data.equipment);
  const zones = buildFunctionalCheckBlocks(data);
  const physicalZones = zones.filter((zone) => zone.visual?.area);
  const typeName = equipmentTypeName(data.equipment);
  const sectionStatus = (zone: any) => {
    const local = pending.find((item) => item.type === 'check-block' && item.blockId === zone.id);
    if (local?.payload?.status) return normalizeCheckStatus(local.payload.status);
    return normalizeCheckStatus(zone.result?.result ?? 'Sin revisar');
  };
  const incidences = (zone: any) => pending.filter((item) => item.blockId === zone.id && item.payload.incidence).length;
  const reviewed = zones.filter((zone) => sectionStatus(zone) !== 'Sin revisar').length;
  const allReviewed = zones.length > 0 && reviewed === zones.length;
  const globalResult = zones.some((zone) => sectionStatus(zone) === 'No favorable') ? 'No favorable' : zones.some((zone) => sectionStatus(zone) === 'Problema leve') ? 'Problema leve' : 'Todo favorable';
  const canFinishCheck = allReviewed && pending.length === 0;
  const blockHref = (zoneId: CheckBlockId) => workspace === 'superadmin' ? `/app/superadmin/checks/${id}/bloque/${zoneId}` : `/app/checks/${id}/bloque/${zoneId}`;
  const manageAllowed = canManageCheck(profile);
  const executeAllowed = canExecuteCheck(profile) && canFinishCheck;
  const finish = async () => {
    try {
      setActionError('');
      if (!canFinishCheck) throw new Error('Sincroniza primero los cambios locales pendientes y revisa todos los bloques antes de finalizar el check.');
      await checksService.finish(id, globalResult);
      setMode(null);
      reload();
    } catch (err) {
      console.error(err);
      setActionError(err instanceof Error ? err.message : 'No se ha podido finalizar el check.');
    }
  };
  return <section className="check-mobile"><BackButton /><header><p className="eyebrow">Check {data.check_templates?.name ?? 'Plantilla no informada'}</p><h2>{data.code} · {data.equipment?.code}</h2><p>{reviewed} de {zones.length} bloques revisados</p>{!typeName && <p className="form-error">Tipo de equipo no disponible. Corrige el equipo antes de ejecutar bloques incompatibles.</p>}{templateTypeMismatch(data) && <p className="form-error">La plantilla asignada no coincide con el tipo real del equipo.</p>}{template?.placeholder && <p className="large-note">Falta imagen específica de este equipo. Las secciones reales se muestran como tarjetas.</p>}<div className="actions">{manageAllowed && <button onClick={() => setMode('edit')}>Modificar check</button>}<SyncButton checkId={id} onSynced={reload} /></div></header>{actionError && <p className="form-error">{actionError}</p>}<div className="progress"><span style={{ width: `${Math.min(100, (reviewed / zones.length) * 100)}%` }} /></div><div className={`door-check ${template?.placeholder ? 'placeholder' : ''}`} aria-label="Zonas táctiles del equipo">{template?.image ? <img src={template?.image} alt={template?.name ?? data.check_templates?.name ?? 'Equipo'} /> : <div className="equipment-placeholder"><Factory size={48} /><strong>{template?.name ?? data.check_templates?.name ?? 'Equipo'}</strong><span>Imagen específica pendiente</span></div>}{physicalZones.map((zone) => <Link key={zone.id} style={{ ...zone.visual?.area, zIndex: zone.visual?.zIndex }} className={`hotspot ${severityForStatus(sectionStatus(zone))}`} to={blockHref(zone.id)} aria-label={`Revisar ${zone.name}`}><span>{zone.name}</span></Link>)}</div><div className="block-list status-summary" aria-label="Resumen de bloques revisados">{zones.map((zone) => <Link className="check-block-card" to={blockHref(zone.id)} key={zone.id}><div><strong>{zone.name}</strong><small>{zone.visual?.area ? 'Zona sobre imagen' : 'Bloque general fuera de imagen'} · {incidences(zone.id)} incidencias · {pending.some((item) => item.blockId === zone.id) ? 'Pendiente de sincronizar' : 'Sincronizado'}</small></div><Badge tone={severityForStatus(sectionStatus(zone))}>{displayStatus(sectionStatus(zone))}</Badge></Link>)}</div>{executeAllowed && <button className="primary wide big" disabled={!allReviewed} onClick={() => setMode('finish')}>Finalizar check</button>}{!allReviewed && <p className="large-note">Para finalizar, todos los bloques, incluido Funcionamiento general, deben estar revisados o marcados como No aplicable.</p>}{mode === 'edit' && manageAllowed && <CheckForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'finish' && <ConfirmModal title="Completar check" text="Se finalizará el check en Supabase. Sincroniza antes los bloques pendientes." onCancel={() => setMode(null)} onConfirm={finish} />}</section>;
}

function CheckBlockPage({ forcedId, forcedBlockId }: { forcedId?: string; forcedBlockId?: string } = {}) {
  const { id: routeId = '', blockId: routeBlockId = 'hoja' } = useParams();
  const id = forcedId ?? routeId;
  const blockId = forcedBlockId ?? routeBlockId;
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { data, loading, error } = useLoad(() => workspace === 'tecnico' ? checksService.getTechnicianAssigned(id) : checksService.get(id), [id, workspace], null as any);
  const [status, setStatus] = useState('Sin revisar');
  const [confirmedStatus, setConfirmedStatus] = useState('Sin revisar');
  const [observations, setObservations] = useState('');
  const [intervention, setIntervention] = useState('');
  const [severity, setSeverity] = useState('Leve');
  const [components, setComponents] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Record<string, any>[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const zones = data ? buildFunctionalCheckBlocks(data) : [];
  const zone = zones.find((item) => item.id === blockId || item.sectionId === blockId) ?? zones[0];
  const section = zone ? { id: zone.sectionId, title: zone.name, check_template_items: zone.items } : null;
  const existing = data?.check_section_results?.find((item: any) => item.section_id === section?.id);
  const itemResults = (data?.check_item_results ?? []).filter((item: any) => (section?.check_template_items ?? []).some((templateItem: any) => templateItem.id === item.item_id));
  const remotePhotos = (data?.check_photos ?? []).filter((photo: any) => !photo.files?.metadata?.section_id || photo.files?.metadata?.section_id === section?.id || photo.description === section?.title);
  const relatedDeficiencies = (data?.deficiencies ?? []).filter((item: any) => item.section_id === section?.id);
  useEffect(() => {
    setLocalLoaded(false);
    technicianOfflineService.sectionState(id, blockId).then((local) => {
      if (local) {
        const normalized = normalizeCheckStatus(local.status);
        setStatus(normalized); setConfirmedStatus(normalized); setObservations(local.observations ?? ''); setIntervention(local.intervention ?? ''); setSeverity(local.severity ?? 'Leve'); setComponents(local.components ?? []); setPhotos(local.photos ?? []);
      } else if (existing) {
        const normalized = normalizeCheckStatus(existing.result);
        const remote = remoteBlockState(existing);
        setStatus(normalized); setConfirmedStatus(normalized); setObservations(remote.observations); setIntervention(remote.intervention); setSeverity(remote.severity); setComponents(remote.components); setPhotos([]);
      } else {
        setStatus('Sin revisar'); setConfirmedStatus('Sin revisar'); setObservations(''); setIntervention(''); setSeverity('Leve'); setComponents([]); setPhotos([]);
      }
      setLocalLoaded(true);
    });
  }, [id, blockId, existing?.id, existing?.result, existing?.observations, existing?.intervention, existing?.severity, JSON.stringify(existing?.components ?? [])]);
  if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />;
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={undefined} empty={!data} />;
  if (!equipmentTypeName(data.equipment)) return <section className="page"><BackButton /><Card title="Tipo de equipo no disponible"><p className="form-error">No se puede ejecutar este bloque porque el equipo no tiene tipo. Corrige el equipo desde SAT antes de sincronizar resultados.</p>{data.equipment_id && <Link className="primary" to={`/app/equipos/${data.equipment_id}`}>Abrir/corregir equipo</Link>}</Card></section>;
  if (!section || !isUuid(section.id)) return <section className="page"><BackButton /><Card title="Sección no disponible"><p className="form-error">Este bloque no corresponde a una sección real UUID de la plantilla asociada al check. No se enviará ningún resultado sintético.</p></Card></section>;
  const needsDetail = checkProblemStatuses.includes(status);
  const hasChanges = localLoaded && status !== 'Sin revisar' && (status !== confirmedStatus || observations.trim() || intervention.trim() || components.length || photos.length);
  const toggleComponent = (component: string) => setComponents((current) => current.includes(component) ? current.filter((item) => item !== component) : [...current, component]);
  const selectStatus = (nextStatus: string) => { setStatus(nextStatus); setSaveState('idle'); if (!checkProblemStatuses.includes(nextStatus)) { setObservations(''); setIntervention(''); setComponents([]); setPhotos([]); } };
  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const nextPhotos = await Promise.all(Array.from(files).map(fileToLocalPhoto));
      setPhotos((current) => [...current, ...nextPhotos]);
      setSaveState('idle');
    } catch {
      setSaveState('error');
    }
  };
  const save = async () => {
    if (!section || !isUuid(section.id) || !hasChanges || status === 'Sin revisar') return;
    setSaving(true); setSaveState('saving');
    const persisted = status.replace('Favorable tras intervención', 'Favorable tras intervencion');
    try {
      await technicianOfflineService.upsert({ type: 'check-block', workOrderId: data.work_order_id, checkId: id, blockId: zone.id, sectionId: section.id, payload: { blockId: zone.id, sectionId: section.id, sectionTitle: zone.name, status, persistedStatus: persisted, items: section.check_template_items ?? [], components: status === 'Todo favorable' ? (zone.items ?? []).map((item: any) => item.component ?? item.title) : components, observations: needsDetail ? observations : '', intervention: needsDetail ? intervention : '', incidence: needsDetail, severity, date: new Date().toISOString(), user: data.technician_id } });
      if (needsDetail) await technicianOfflineService.upsert({ type: 'deficiency', workOrderId: data.work_order_id, checkId: id, blockId: zone.id, sectionId: section.id, payload: { id: `${zone.id}-deficiency`, sectionId: section.id, severity, description: observations, recommendedAction: intervention } });
      if (needsDetail) await Promise.all(photos.map((photo) => technicianOfflineService.upsert({ type: 'photo', workOrderId: data.work_order_id, checkId: id, blockId: zone.id, sectionId: section.id, payload: { ...photo, sectionId: section.id, sectionTitle: zone.name, description: observations } })));
      setConfirmedStatus(status); setSaveState('saved');
      setTimeout(() => navigate(workspace === 'superadmin' ? `/app/superadmin/checks/${id}` : `/app/checks/${id}`), 450);
    } catch { setSaveState('error'); }
    finally { setSaving(false); }
  };
  return <section className="check-mobile block-page"><button className="link-button sticky-back" onClick={() => navigate(workspace === 'superadmin' ? `/app/superadmin/checks/${id}` : `/app/checks/${id}`)}><ChevronLeft size={16} /> Volver a la puerta</button><header><p className="eyebrow">Detalle del bloque</p><h2>{zone.name}</h2><Badge tone={severityForStatus(status)}>{displayStatus(status)}</Badge></header><div className="status-grid">{checkStatuses.map((item) => <button type="button" key={item} className={status === item ? 'active' : ''} onClick={() => selectStatus(item)}>{item}</button>)}</div>{status === 'Sin revisar' && <p className="large-note">Selecciona un estado. No se guardará hasta pulsar Confirmar selección.</p>}{needsDetail && <Card title="Observación e intervención"><label>Observación<textarea value={observations} onChange={(event) => { setObservations(event.target.value); setSaveState('idle'); }} /></label><label>Intervención<textarea value={intervention} onChange={(event) => { setIntervention(event.target.value); setSaveState('idle'); }} placeholder="Intervención realizada si aplica" /></label></Card>}{needsDetail && <Card title="Incidencia del bloque"><div className="component-select">{(zone.items ?? []).map((item: any) => { const component = item.component ?? item.title; return <label key={component}><input type="checkbox" checked={components.includes(component)} onChange={() => { toggleComponent(component); setSaveState('idle'); }} /> {component}</label>; })}</div><FormSelect label="Gravedad" value={severity} onChange={(value) => { setSeverity(value); setSaveState('idle'); }} options={['Leve','Media','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /><div className="photo-strip"><label className="component-photo">Añadir foto real<input type="file" accept="image/*" capture="environment" multiple onChange={(event) => addPhotos(event.target.files)} /></label></div>{photos.length > 0 && <div className="photo-list">{photos.map((photo) => <span key={photo.id ?? photo.name}>{photo.name ?? 'Foto'} · Foto pendiente de sincronizar<button type="button" onClick={() => { setPhotos((current) => current.filter((item) => item !== photo)); setSaveState('idle'); }}>Quitar</button></span>)}</div>}<p className="large-note">Las fotos quedan guardadas en este dispositivo. Foto guardada localmente y pendiente de sincronización.</p></Card>}<button className="primary wide sticky-save" disabled={!hasChanges || saving} onClick={save}>{saving ? 'Guardando...' : saveState === 'saved' ? 'Guardado localmente' : 'Confirmar selección'}</button>{saveState === 'saved' && <p className="success-note">Bloque guardado localmente y pendiente de sincronización segura.</p>}{saveState === 'error' && <p className="form-error">No se ha podido guardar el bloque localmente.</p>}</section>;
}

function CheckBlockPageV2({ forcedId, forcedBlockId }: { forcedId?: string; forcedBlockId?: string } = {}) {
  const { id: routeId = '', blockId: routeBlockId = '' } = useParams();
  const id = forcedId ?? routeId;
  const blockId = forcedBlockId ?? routeBlockId;
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const { data, loading, error } = useLoad(() => workspace === 'tecnico' ? checksService.getTechnicianAssigned(id) : checksService.get(id), [id, workspace], null as any);
  const [status, setStatus] = useState('Sin revisar');
  const [confirmedStatus, setConfirmedStatus] = useState('Sin revisar');
  const [observations, setObservations] = useState('');
  const [intervention, setIntervention] = useState('');
  const [severity, setSeverity] = useState('Leve');
  const [components, setComponents] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Record<string, any>[]>([]);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const zones = data ? buildFunctionalCheckBlocks(data) : [];
  const zone = zones.find((item) => item.id === blockId || item.sectionId === blockId) ?? zones[0];
  const section = zone ? { id: zone.sectionId, title: zone.name, check_template_items: zone.items } : null;
  const existing = data?.check_section_results?.find((item: any) => item.section_id === section?.id);
  const itemResults = (data?.check_item_results ?? []).filter((item: any) => (section?.check_template_items ?? []).some((templateItem: any) => templateItem.id === item.item_id));
  const remotePhotos = (data?.check_photos ?? []).filter((photo: any) => !photo.files?.metadata?.section_id || photo.files?.metadata?.section_id === section?.id || photo.description === section?.title);
  const relatedDeficiencies = (data?.deficiencies ?? []).filter((item: any) => item.section_id === section?.id);
  useEffect(() => {
    if (!data || !zone) return;
    setLocalLoaded(false);
    technicianOfflineService.sectionState(id, zone.id).then((local) => {
      if (local) {
        const normalized = normalizeCheckStatus(local.status);
        setStatus(normalized); setConfirmedStatus(normalized); setObservations(local.observations ?? ''); setIntervention(local.intervention ?? ''); setSeverity(local.severity ?? 'Leve'); setComponents(local.components ?? []); setPhotos(local.photos ?? []);
      } else if (existing) {
        const normalized = normalizeCheckStatus(existing.result);
        setStatus(normalized); setConfirmedStatus(normalized); setObservations(existing.observations ?? ''); setIntervention(existing.intervention ?? ''); setSeverity(existing.severity ?? 'Leve'); setComponents(Array.isArray(existing.components) ? existing.components : []); setPhotos([]);
      } else {
        setStatus('Sin revisar'); setConfirmedStatus('Sin revisar'); setObservations(''); setIntervention(''); setSeverity('Leve'); setComponents([]); setPhotos([]);
      }
      setLocalLoaded(true);
    });
  }, [id, zone?.id, existing?.id, existing?.result, existing?.observations, existing?.intervention, existing?.severity, JSON.stringify(existing?.components ?? [])]);
  if (workspace === 'tecnico' && (error || (!loading && !data))) return <AccessDenied />;
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={undefined} empty={!data} />;
  if (!equipmentTypeName(data.equipment)) return <section className="page"><BackButton /><Card title="Tipo de equipo no disponible"><p className="form-error">No se puede ejecutar este bloque porque el equipo no tiene tipo. Corrige el equipo desde SAT antes de sincronizar resultados.</p>{data.equipment_id && <Link className="primary" to={`/app/equipos/${data.equipment_id}`}>Abrir/corregir equipo</Link>}</Card></section>;
  if (!section || !isUuid(section.id)) return <section className="page"><BackButton /><Card title="Sección no disponible"><p className="form-error">Este bloque no corresponde a una sección real UUID de la plantilla asociada al check. No se enviará ningún resultado sintético.</p></Card></section>;
  const needsDetail = checkProblemStatuses.includes(status);
  const hasChanges = workspace === 'tecnico' && localLoaded && status !== 'Sin revisar' && (status !== confirmedStatus || observations.trim() !== (existing?.observations ?? '') || intervention.trim() !== (existing?.intervention ?? '') || JSON.stringify(components) !== JSON.stringify(Array.isArray(existing?.components) ? existing.components : []) || photos.length);
  const toggleComponent = (component: string) => setComponents((current) => current.includes(component) ? current.filter((item) => item !== component) : [...current, component]);
  const selectStatus = (nextStatus: string) => { setStatus(nextStatus); setSaveState('idle'); if (!checkProblemStatuses.includes(nextStatus)) { setObservations(''); setIntervention(''); setComponents([]); setPhotos([]); } };
  const addPhotos = async (files: FileList | null) => { if (!files?.length) return; try { const nextPhotos = await Promise.all(Array.from(files).map(fileToLocalPhoto)); setPhotos((current) => [...current, ...nextPhotos]); setSaveState('idle'); } catch { setSaveState('error'); } };
  const save = async () => {
    if (!hasChanges) return;
    setSaving(true); setSaveState('saving');
    const persisted = status.replace('Favorable tras intervención', 'Favorable tras intervencion');
    try {
      await technicianOfflineService.upsert({ type: 'check-block', workOrderId: data.work_order_id, checkId: id, blockId: zone.id, sectionId: section.id, payload: { blockId: zone.id, sectionId: section.id, sectionTitle: zone.name, status, persistedStatus: persisted, items: section.check_template_items ?? [], components: status === 'Todo favorable' ? (zone.items ?? []).map((item: any) => item.component ?? item.title) : components, observations: needsDetail ? observations : '', intervention: needsDetail ? intervention : '', incidence: needsDetail, severity, date: new Date().toISOString(), user: data.technician_id } });
      if (needsDetail) await Promise.all(photos.map((photo) => technicianOfflineService.upsert({ type: 'photo', workOrderId: data.work_order_id, checkId: id, blockId: zone.id, sectionId: section.id, payload: { ...photo, sectionId: section.id, sectionTitle: zone.name, description: observations } })));
      setConfirmedStatus(status); setSaveState('saved');
    } catch { setSaveState('error'); }
    finally { setSaving(false); }
  };
  return <section className="check-mobile block-page"><button className="link-button sticky-back" onClick={() => navigate(workspace === 'superadmin' ? `/app/superadmin/checks/${id}` : `/app/checks/${id}`)}><ChevronLeft size={16} /> Volver al check</button><header><p className="eyebrow">Detalle del bloque</p><h2>{zone.name}</h2><Badge tone={severityForStatus(status)}>{displayStatus(status)}</Badge><small>{data.check_templates?.name ?? 'Plantilla no informada'} · {equipmentTypeName(data.equipment) ?? 'Tipo no disponible'} · Técnico: {fullName(data.profiles) || '-'}</small></header><Card title="Resultado remoto"><InfoGrid items={[[ 'Estado', displayStatus(status) ], [ 'Observaciones', observations || '-' ], [ 'Intervención', intervention || '-' ], [ 'Gravedad', severity || '-' ], [ 'Componentes', components.join(', ') || '-' ], [ 'Sincronizado', existing?.synced_at ? formatDate(existing.synced_at) : existing?.updated_at ? formatDate(existing.updated_at) : '-' ]]}/></Card><Card title="Ítems de la sección"><div className="work-detail-list">{(section.check_template_items ?? []).map((item: any) => { const result = itemResults.find((row: any) => row.item_id === item.id); return <article key={item.id}><Badge tone={severityForStatus(result?.result ?? status)}>{displayStatus(result?.result ?? status)}</Badge><p><strong>{item.title}</strong><br /><small>{item.component ?? 'Componente no informado'}</small><br />{result?.observations ?? ''}</p></article>; })}</div></Card><Card title={`Fotos del bloque (${remotePhotos.length})`}><div className="media-grid">{remotePhotos.map((photo: any) => photo.signed_url ? <a key={photo.id} href={photo.signed_url} target="_blank" rel="noreferrer"><img src={photo.signed_url} alt={photo.description ?? photo.files?.name ?? 'Foto del bloque'} /><strong>{photo.description ?? photo.files?.name ?? 'Foto del bloque'}</strong><small>{formatDate(photo.taken_at ?? photo.created_at)}</small></a> : <article key={photo.id} className="media-error"><strong>{photo.description ?? photo.files?.name ?? 'Foto del bloque'}</strong><p className="form-error">{photo.file_error ?? 'No se ha podido cargar el archivo'}</p></article>)}{!remotePhotos.length && <p className="large-note">Sin fotos remotas para este bloque.</p>}</div></Card><Card title={`Deficiencias (${relatedDeficiencies.length})`}><CompactRows rows={relatedDeficiencies.map((item: any) => [item.code ?? item.severity, item.description ?? '-', severityForStatus(item.severity), `/app/deficiencias/${item.id}`])} empty="Sin deficiencias relacionadas." /></Card>{workspace === 'tecnico' && <><div className="status-grid">{checkStatuses.map((item) => <button type="button" key={item} className={status === item ? 'active' : ''} onClick={() => selectStatus(item)}>{item}</button>)}</div>{needsDetail && <Card title="Editar observación e intervención"><label>Observación<textarea value={observations} onChange={(event) => { setObservations(event.target.value); setSaveState('idle'); }} /></label><label>Intervención<textarea value={intervention} onChange={(event) => { setIntervention(event.target.value); setSaveState('idle'); }} /></label><FormSelect label="Gravedad" value={severity} onChange={(value) => { setSeverity(value); setSaveState('idle'); }} options={['Leve','Media','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /><div className="component-select">{(zone.items ?? []).map((item: any) => { const component = item.component ?? item.title; return <label key={component}><input type="checkbox" checked={components.includes(component)} onChange={() => { toggleComponent(component); setSaveState('idle'); }} /> {component}</label>; })}</div><label className="component-photo">Añadir foto real<input type="file" accept="image/*" capture="environment" multiple onChange={(event) => addPhotos(event.target.files)} /></label></Card>}<div className="confirm-bar"><button className="primary wide big" disabled={!hasChanges || saving || status === 'Sin revisar'} onClick={save}>{saving ? 'Guardando...' : 'Confirmar selección'}</button>{saveState === 'saved' && <p className="success-note">Guardado localmente. Sincroniza para enviarlo a Supabase.</p>}{saveState === 'error' && <p className="form-error">No se ha podido guardar el bloque.</p>}</div></>}</section>;
}

function CheckBlockPageLegacy() { return null; }

function DeficienciesPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const initial = deficiencyFiltersFromParams(params);
  const [state, setState] = useState(initial.state);
  const [severity, setSeverity] = useState(initial.severity);
  const [origin, setOrigin] = useState(initial.origin);
  const { data, loading, error, reload } = useLoad(() => deficienciesService.list(search), [search], [] as any[]);
  useEffect(() => { const next = deficiencyFiltersFromParams(params); setState(next.state); setSeverity(next.severity); setOrigin(next.origin); }, [params]);
  const updateFilter = (key: 'state' | 'severity' | 'origin', value: string) => { const updated = new URLSearchParams(params); if (key === 'state') { updated.delete('filtro'); value === 'todos' ? updated.delete('estado') : updated.set('estado', value); } if (key === 'severity') value === 'todas' ? updated.delete('gravedad') : updated.set('gravedad', value); if (key === 'origin') value === 'todos' ? updated.delete('origen') : updated.set('origen', value); setParams(updated, { replace: true }); };
  const clear = () => { setParams(new URLSearchParams(), { replace: true }); };
  const rows = data.filter((item) => {
    const byState = state === 'todos' || (state === 'abierta' ? isOpenDeficiencyStatus(item.status) : state === 'valoracion' ? ['pendiente-de-valoracion','en-valoracion'].includes(normalizeParam(item.status)) : normalizeParam(item.status) === state);
    const bySeverity = severity === 'todas' || normalizeParam(item.severity) === severity;
    const byOrigin = origin === 'todos' || normalizeParam(item.origin ?? item.source ?? item.type) === origin;
    return byState && bySeverity && byOrigin;
  });
  return <ListPage title="Deficiencias" summary="Deficiencias y acciones correctivas conectadas." search={search} setSearch={setSearch} loading={loading} error={error} retry={reload} empty={!rows.length}><div className="filters sat-filters"><FormSelect label="Estado" value={state} onChange={(value) => updateFilter('state', value)} options={[['todos','Todos'],['abierta','Abiertas'],['pendiente','Pendientes'],['valoracion','En valoración'],['presupuestada','Presupuestadas'],['corregida','Corregidas'],['cerrada','Cerradas']].map(([value, label]) => ({ value, label }))} /><FormSelect label="Gravedad" value={severity} onChange={(value) => updateFilter('severity', value)} options={[['todas','Todas'],['baja','Baja'],['media','Media'],['alta','Alta'],['critica','Crítica']].map(([value, label]) => ({ value, label }))} /><FormSelect label="Origen" value={origin} onChange={(value) => updateFilter('origin', value)} options={[['todos','Todos'],['oportunidad','Oportunidad']].map(([value, label]) => ({ value, label }))} /><button className="link-button" onClick={clear}>Limpiar filtros</button></div>{origin === 'oportunidad' && <p className="large-note">No se mezclan oportunidades con deficiencias salvo registros que tengan origen explícito de oportunidad.</p>}<WorkTable rows={rows} columns={['code', 'description', 'severity', 'status']} route="/app/deficiencias" /></ListPage>;
}

function DeficiencyDetailPage() { const { id = '' } = useParams(); const { data, loading, error, reload } = useLoad(() => deficienciesService.get(id), [id], null as any); const [action, setAction] = useState(''); const [message, setMessage] = useState(''); const [actionError, setActionError] = useState(''); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; const changeStatus = async () => { try { setActionError(''); await deficienciesService.update(id, { status: 'En valoracion' }); setMessage('Estado actualizado.'); reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido cambiar el estado.'); } }; const addAction = async (event: FormEvent) => { event.preventDefault(); try { setActionError(''); await deficienciesService.addAction(id, { description: action, status: 'Pendiente' }); setAction(''); setMessage('Acción correctiva creada.'); reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido crear la acción correctiva.'); } }; return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.description}`} subtitle={`${data.clients?.legal_name ?? ''} · ${displayStatus(data.status)}`} tone={severityForPriority(data.severity)} /><div className="actions">{data.work_order_id && <Link to={`/app/partes/${data.work_order_id}`}>Abrir parte</Link>}{data.check_id && <Link to={`/app/checks/${data.check_id}`}>Abrir check</Link>}{data.equipment_id && <Link to={`/app/equipos/${data.equipment_id}`}>Abrir equipo</Link>}{data.client_id && <Link to={`/app/clientes/${data.client_id}`}>Abrir cliente</Link>}{data.site_id && <Link to={`/app/centros/${data.site_id}`}>Abrir centro</Link>}<button onClick={changeStatus}>Cambiar a valoración</button></div>{message && <p className="success-note">{message}</p>}{actionError && <p className="form-error">{actionError}</p>}<Card title="Detalle"><InfoGrid items={[[ 'Gravedad', displayStatus(data.severity) ], [ 'Estado', displayStatus(data.status) ], [ 'Origen', displayStatus(data.origin ?? data.source ?? '-') ], [ 'Acción recomendada', data.recommended_action ?? '-' ], [ 'Responsable', fullName(data.profiles) || '-' ]]} /></Card><Card title="Acciones correctivas"><form onSubmit={addAction}><label>Añadir acción recomendada<input value={action} onChange={(event) => setAction(event.target.value)} required /></label><button className="primary">Guardar acción</button></form><Timeline items={(data.corrective_actions ?? []).map((item: any) => `${displayStatus(item.status)} · ${item.description}`)} /></Card></section>; }

function AlertsPage() {
  const { workspace } = useAuth();
  const [creating, setCreating] = useState(false);
  const canCreate = ['sat', 'gerencia', 'comercial'].includes(workspace);
  return <section className="page"><div className="page-head"><div><h2>Avisos</h2><p>Leer, abrir, ir al registro, cerrar y reabrir funcionan contra Supabase.</p></div>{canCreate && <button className="primary" onClick={() => setCreating(true)}>Crear aviso</button>}</div><AlertsPanel showFilters />{creating && <AlertForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); window.dispatchEvent(new Event('dmp-alerts-changed')); }} />}</section>;
}

function AlertsPanel({ onClose, showFilters = false }: { onClose?: () => void; showFilters?: boolean }) {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(() => alertsService.list(), [], [] as any[]);
  const [filter, setFilter] = useState('todos');
  const [actionError, setActionError] = useState('');
  const notify = () => window.dispatchEvent(new Event('dmp-alerts-changed'));
  const runAlertAction = async (operation: () => Promise<any>) => { try { setActionError(''); await operation(); notify(); await reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido actualizar el aviso.'); } };
  const markRead = async (row: any) => { if (!row.is_read) await runAlertAction(() => alertsService.markAsRead(row.id)); };
  const open = async (row: any) => { await markRead(row); onClose?.(); navigate('/app/avisos'); };
  const goRelated = async (row: any) => { await markRead(row); const route = routeForAlert(row.alerts); onClose?.(); navigate(route); };
  const close = async (row: any) => runAlertAction(() => alertsService.close(row.id));
  const reopen = async (row: any) => runAlertAction(() => alertsService.reopen(row.id));
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
  return <StateBlock loading={loading} error={error} retry={reload} empty={false}>{actionError && <p className="form-error">{actionError}</p>}{showFilters && <div className="alert-filters"><div className="tabs">{[['todos','Todos'],['sin-leer','Sin leer'],['leidos','Leídos'],['abiertos','Abiertos'],['cerrados','Cerrados'],['alta','Alta prioridad'],['criticos','Críticos']].map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><p className="large-note">Filtro activo: {filter.replace('-', ' ')} · {filtered.length} resultado(s)</p><button className="link-button" onClick={() => setFilter('todos')}>Restablecer filtros</button></div>}{!filtered.length ? <Card title="Sin avisos para este filtro"><p className="large-note">No hay avisos que cumplan el filtro seleccionado. Puedes restablecer filtros o crear un aviso nuevo si tu rol lo permite.</p></Card> : <div className="alerts-panel compact-list">{filtered.map((row) => { const alert = row.alerts; const relatedRoute = routeForAlert(alert); return <article key={row.id} className={row.is_read ? 'read' : ''}><Badge tone={severityForPriority(alert.priority)}>{alert.title}</Badge><p>{alert.description}<br /><small>{formatDate(alert.alert_date)} · Aviso {displayStatus(alert.status)} · {row.closed_at ? 'Cerrado por destinatario' : row.is_read ? 'Leído' : 'Sin leer'}</small></p><div className="row-actions"><button onClick={() => markRead(row)} disabled={row.is_read}>Marcar como leído</button><button onClick={() => open(row)}>Abrir aviso</button>{relatedRoute !== '/app/avisos' && <button onClick={() => goRelated(row)}>Ir al registro</button>}{row.closed_at ? <button onClick={() => reopen(row)}>Reabrir</button> : <button onClick={() => close(row)}>Cerrar</button>}</div></article>; })}</div>}</StateBlock>;
}

function DocumentsPage() { const [search, setSearch] = useState(''); const { data, loading, error, reload } = useLoad(() => documentsService.list(search), [search], [] as any[]); const [creating, setCreating] = useState(false); return <ListPage title="Documentación" summary="Documentos y vínculos conectados a public.documents y document_links." search={search} setSearch={setSearch} action={<button className="primary" onClick={() => setCreating(true)}>Crear documento</button>} loading={loading} error={error} retry={reload} empty={!data.length}><div className="doc-list">{data.map((doc) => <article key={doc.id}><FileText size={17} /><div><strong>{doc.title}</strong><span>{doc.type} · {doc.origin ?? 'Sin origen'}</span></div><Link to={`/app/documentos/${doc.id}`}>Abrir</Link></article>)}</div>{creating && <DocumentForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}</ListPage>; }

function DocumentDetailPage() { const { id = '' } = useParams(); const { data, loading, error, reload } = useLoad(() => documentsService.get(id), [id], null as any); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; return <section className="page"><BackButton /><Hero title={data.title} subtitle={`${data.type} · ${data.version ?? 'sin versión'}`} tone="info" /><Card title="Ficha documental"><InfoGrid items={[[ 'Tipo', data.type ], [ 'Fecha', data.document_date ?? '-' ], [ 'Origen', data.origin ?? '-' ], [ 'Disponible offline', data.available_offline ? 'Sí' : 'No' ], [ 'Archivo real', data.file_id ? 'Sí' : 'No' ], [ 'URL', data.url ?? 'Sin archivo vinculado' ], [ 'Observaciones', data.observations ?? '-' ]]} /></Card><Card title="Vínculos"><CompactRows rows={(data.document_links ?? []).map((l: any) => [l.related_type, l.related_value ?? l.related_id, 'info', '/app/documentos'])} empty="Sin vínculos." /></Card></section>; }

function ManagementPage() { const { data, loading, error, reload } = useLoad(() => managementService.metrics(), [], [] as any[]); const row = data[0] ?? {}; return <section className="page"><Breadcrumb items={['Gerencia', 'Métricas']} /><div className="page-head"><div><h2>Métricas básicas</h2><p>Mes actual para partes y presupuestos aceptados. Cada indicador enlaza al listado que contiene sus registros origen.</p></div></div><StateBlock loading={loading} error={error} retry={reload} empty={!data.length}><div className="stats-grid">{[['Clientes', row.clients, '/app/clientes'], ['Equipos', row.equipment, '/app/equipos'], ['Partes del mes', row.work_orders_this_month, '/app/partes?fecha=hoy'], ['Presupuestos aceptados', row.accepted_quotes, '/app/modulos/presupuestos?estado=aceptado'], ['Importe aceptado', `${row.accepted_quote_amount ?? 0} €`, '/app/modulos/presupuestos?estado=aceptado']].map(([label, value, route]) => <Link key={label} className="metric info" to={String(route)}><div><Gauge {...iconProps} /><span>{label}</span></div><strong>{value}</strong><small>Mes actual · abrir registros origen</small></Link>)}</div></StateBlock></section>; }

function SalesModule({ mode }: { mode: 'ventas' | 'oportunidades' | 'presupuestos' }) {
  const [params] = useSearchParams();
  const status = normalizeParam(params.get('estado'));
  const { data, loading, error, reload } = useLoad(() => managementService.salesData(), [], { opportunities: [], quotes: [] } as any);
  const quotes = data.quotes.filter((quote: any) => !status || status === 'todos' || normalizeParam(quote.status) === status);
  const opportunities = data.opportunities.filter((opp: any) => !status || status === 'todos' || normalizeParam(opp.status) === status);
  const accepted = quotes.filter((quote: any) => quote.status === 'Aceptado');
  const total = accepted.reduce((sum: number, quote: any) => sum + Number(quote.total ?? 0), 0);
  const showQuotes = mode !== 'oportunidades';
  const showOpps = mode !== 'presupuestos';
  return <section className="page"><Breadcrumb items={['Gerencia', mode === 'ventas' ? 'Ventas' : mode === 'presupuestos' ? 'Presupuestos' : 'Oportunidades']} /><Hero title={mode === 'ventas' ? 'Ventas ejecutivas' : mode === 'presupuestos' ? 'Presupuestos' : 'Oportunidades'} subtitle="Vista de solo lectura basada en opportunities y quotes." tone="commercial" /><StateBlock loading={loading} error={error} retry={reload} empty={!data.quotes.length && !data.opportunities.length}><div className="stats-grid"><div className="metric ok"><div><Gauge {...iconProps} /><span>Presupuestos aceptados</span></div><strong>{accepted.length}</strong><small>Total: {total.toLocaleString('es-ES')} €</small></div><div className="metric info"><div><Gauge {...iconProps} /><span>Oportunidades</span></div><strong>{opportunities.length}</strong><small>Registros visibles por RLS</small></div></div>{showQuotes && <Card title="Presupuestos"><div className="table-card"><table><thead><tr><th>Código</th><th>Estado</th><th>Cliente</th><th>Oportunidad</th><th>Fecha</th><th>Base</th><th>Impuestos</th><th>Total</th><th>Responsable</th></tr></thead><tbody>{quotes.map((quote: any) => <tr key={quote.id}><td>{quote.code}</td><td>{displayStatus(quote.status)}</td><td>{quote.clients?.legal_name ?? '-'}</td><td>{quote.opportunities?.title ?? quote.opportunities?.code ?? '-'}</td><td>{quote.issue_date ?? '-'}</td><td>{Number(quote.subtotal ?? 0).toLocaleString('es-ES')} €</td><td>{Number(quote.tax_amount ?? 0).toLocaleString('es-ES')} €</td><td>{Number(quote.total ?? 0).toLocaleString('es-ES')} €</td><td>{fullName(quote.profiles) || '-'}</td></tr>)}</tbody></table></div>{!quotes.length && <p className="large-note">No hay presupuestos para el filtro actual.</p>}</Card>}{showOpps && <Card title="Oportunidades"><div className="table-card"><table><thead><tr><th>Código</th><th>Título</th><th>Cliente</th><th>Responsable</th><th>Estado</th><th>Importe estimado</th><th>Origen</th><th>Fecha</th></tr></thead><tbody>{opportunities.map((opp: any) => <tr key={opp.id}><td>{opp.code}</td><td>{opp.title}</td><td>{opp.clients?.legal_name ?? '-'}</td><td>{fullName(opp.profiles) || '-'}</td><td>{displayStatus(opp.status)}</td><td>{Number(opp.estimated_amount ?? 0).toLocaleString('es-ES')} €</td><td>{displayStatus(opp.origin)}</td><td>{formatDate(opp.created_at)}</td></tr>)}</tbody></table></div>{!opportunities.length && <p className="large-note">No hay oportunidades para el filtro actual.</p>}</Card>}</StateBlock></section>;
}

function ProfitabilityModule() { return <section className="page"><Breadcrumb items={['Gerencia', 'Rentabilidad']} /><Hero title="Rentabilidad" subtitle="Datos insuficientes para calcular margen real." tone="warn" /><Card title="Sin costes fiables"><p className="large-note">No se muestran márgenes simulados. Para calcular rentabilidad faltan costes reales de materiales, horas, desplazamientos y facturación asociada por parte o presupuesto.</p></Card></section>; }

function OperationsModule() { const { data, loading, error, reload } = useLoad(() => dashboardService.getManagementDashboardData(), [], null as any); if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />; const statuses = Array.from(new Set(data.workOrders.map((work: any) => work.status))).sort(); return <section className="page"><Breadcrumb items={['Gerencia', 'Operaciones']} /><Hero title="Operaciones" subtitle="Resumen de partes por estado y prioridad." tone="maintenance" /><InteractiveBars title="Partes por estado" values={statuses.map((status: any) => [displayStatus(status), data.workOrders.filter((work: any) => work.status === status).length, `/app/partes?estado=${normalizeParam(status)}`]) as any} /><InteractiveBars title="Partes por prioridad" values={['Baja','Normal','Alta','Critica'].map((priority) => [displayStatus(priority), data.workOrders.filter((work: any) => work.priority === priority).length, `/app/partes?prioridad=${normalizeParam(priority)}`]) as any} /></section>; }

function ModulePage() { const { moduleId = '' } = useParams(); if (moduleId === 'planificacion') return <PlanningModule />; if (moduleId === 'tecnicos') return <TechniciansModule />; if (moduleId === 'comerciales') return <CommercialProfilesModule />; if (moduleId === 'ventas') return <SalesModule mode="ventas" />; if (moduleId === 'oportunidades') return <SalesModule mode="oportunidades" />; if (moduleId === 'presupuestos') return <SalesModule mode="presupuestos" />; if (moduleId === 'operaciones') return <OperationsModule />; if (moduleId === 'informes') return <ManagementPage />; if (moduleId === 'personal') return <TechniciansModule />; if (moduleId === 'rentabilidad') return <ProfitabilityModule />; return <OperationalModule moduleId={moduleId} />; }

function OperationalModule({ moduleId }: { moduleId: string }) {
  const { workspace } = useAuth();
  const meta = moduleMeta[moduleId] ?? { title: 'Módulo operativo', description: 'Registros relacionados disponibles en Supabase.', links: [] };
  const { data, loading, error, reload } = useLoad(() => loadModuleRows(moduleId), [moduleId], [] as [string, string, Severity, string][]);
  return <section className="page"><Breadcrumb items={[workspaceTitles[workspace], meta.title]} /><Hero title={meta.title} subtitle={meta.description} tone="info" /><Card title="Registros relacionados"><p className="large-note">Datos reales disponibles para este módulo según permisos y RLS. Si no hay registros, la pantalla queda vacía sin inventar cifras.</p><div className="actions">{meta.links.map((link: any) => <Link key={link.to} to={link.to}>{link.label}</Link>)}</div></Card><StateBlock loading={loading} error={error} retry={reload} empty={!data.length}><CompactRows rows={data} empty="Sin registros relacionados." /></StateBlock></section>;
}

async function loadModuleRows(moduleId: string): Promise<[string, string, Severity, string][]> {
  if (['contratos','administracion','facturacion','cobros','compras','proveedores','prl','vehiculos','informes-comerciales'].includes(moduleId)) {
    const documents = await documentsService.list(moduleMeta[moduleId]?.title ?? '');
    return documents.map((item: any) => [item.title, `${displayStatus(item.type)} · ${item.origin ?? '-'} · ${formatDate(item.updated_at)}`, 'info', `/app/documentos/${item.id}`]);
  }
  if (moduleId === 'visitas') {
    const works = await workOrdersService.list('Visita');
    return works.map((work: any) => [work.code, `${work.title} · ${work.client_name ?? '-'} · ${displayStatus(work.status)}`, severityForStatus(work.status), `/app/partes/${work.id}`]);
  }
  const alerts = await alertsService.list(moduleMeta[moduleId]?.title ?? '');
  return alerts.map((row: any) => [row.alerts?.code ?? row.alerts?.title ?? 'Aviso', `${row.alerts?.description ?? '-'} · ${displayStatus(row.alerts?.status)}`, severityForStatus(row.alerts?.priority), '/app/avisos']);
}

function PlanningModule() {
  const { data, loading, error, reload } = useLoad(() => workOrdersService.listWithAssignments(), [], [] as any[]);
  const today = new Date().toISOString().slice(0, 10);
  const rows = data.filter((work: any) => work.scheduled_date || (work.assignments ?? []).length).sort((a: any, b: any) => `${a.scheduled_date ?? '9999'}${a.scheduled_time ?? ''}`.localeCompare(`${b.scheduled_date ?? '9999'}${b.scheduled_time ?? ''}`));
  const unassigned = data.filter((work: any) => !(work.assignments ?? []).length && !work.main_technician_name);
  return <section className="page"><Breadcrumb items={['SAT', 'Planificación']} /><Hero title="Planificación SAT" subtitle="Agenda real de partes, asignaciones, checks pendientes y huecos sin técnico." tone="maintenance" /><div className="stats-grid"><Link className="metric info" to="/app/partes?fecha=hoy"><div><CalendarClock {...iconProps} /><span>Trabajos hoy</span></div><strong>{data.filter((work: any) => work.scheduled_date === today).length}</strong><small>Abre partes de hoy</small></Link><Link className="metric warn" to="/app/partes?filtro=sin-asignar"><div><UsersRound {...iconProps} /><span>Sin asignar</span></div><strong>{unassigned.length}</strong><small>Requieren técnico</small></Link><Link className="metric danger" to="/app/partes?filtro=checks-pendientes"><div><ClipboardCheck {...iconProps} /><span>Checks pendientes</span></div><strong>{data.filter((work: any) => (work.checks ?? []).some((check: any) => check.status !== 'Realizado')).length}</strong><small>Abre partes con checks</small></Link></div><StateBlock loading={loading} error={error} retry={reload} empty={!rows.length}><div className="sat-work-list">{rows.map((work: any) => <SatWorkOrderCard key={work.id} work={work} />)}</div></StateBlock></section>;
}

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
  const loadError = [[technicians.error, 'Técnicos'], [workOrders.error, 'Partes'], [checks.error, 'Checks pendientes']].filter(([message]) => message).map(([message, label]) => `${label}: ${message}`).join(' | ');
  return <section className="page"><Breadcrumb items={['SAT', 'Técnicos']} /><Hero title="Técnicos SAT" subtitle="Disponibilidad, carga diaria, partes, checks y documentación operativa desde Supabase." tone="maintenance" /><div className="tabs">{[['todos','Todos'],['disponibles','Disponibles'],['ocupados','Ocupados'],['fuera','Fuera de servicio'],['urgentes','Con urgentes']].map(([key, label]) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><StateBlock loading={technicians.loading || workOrders.loading || checks.loading} error={loadError} retry={() => { technicians.reload(); workOrders.reload(); checks.reload(); }} empty={!rows.length}><div className="grid half">{rows.map(({ tech, todayWorks, inProgress, pending, pendingChecks, availability }) => <Card key={tech.id} title={fullName(tech)} action={<Link to={`/app/modulos/tecnicos/${tech.id}`}>Abrir ficha</Link>}><InfoGrid items={[[ 'Estado', tech.active ? 'Activo' : 'Inactivo' ], [ 'Disponibilidad', availability ], [ 'Especialidad', tech.specialty ?? tech.primary_area ?? '-' ], [ 'Teléfono', tech.phone ?? '-' ], [ 'Correo', tech.email ?? '-' ], [ 'Vehículo asignado', tech.vehicle ?? 'No informado' ], [ 'Partes hoy', String(todayWorks.length) ], [ 'En curso', String(inProgress.length) ], [ 'Pendientes', String(pending.length) ], [ 'Checks pendientes', String(pendingChecks) ], [ 'Carga de trabajo', `${todayWorks.length + pending.length} tareas` ], [ 'Última actividad', tech.updated_at ? formatDate(tech.updated_at) : '-' ]]} /><div className="actions"><Link to={`/app/modulos/tecnicos/${tech.id}`}>Ficha operativa</Link><Link to={`/app/partes?fecha=${today}&tecnico=${tech.id}`}>Ver agenda</Link><Link to="/app/avisos">Alertas</Link></div></Card>)}</div></StateBlock></section>;
}

function CommercialProfilesModule() {
  const commercials = useLoad(() => profilesService.listCommercials(), [], [] as any[]);
  const workOrders = useLoad(() => workOrdersService.list(), [], [] as any[]);
  return <section className="page"><Breadcrumb items={['Comercial', 'Comerciales']} /><Hero title="Fichas comerciales" subtitle="Visitas, partes comerciales, clientes relacionados y carga de trabajo." tone="commercial" /><StateBlock loading={commercials.loading || workOrders.loading} error={commercials.error || workOrders.error} retry={() => { commercials.reload(); workOrders.reload(); }} empty={!commercials.data.length}><div className="grid half">{commercials.data.map((person) => { const assigned = workOrders.data.filter((work: any) => work.current_responsible_id === person.id || work.created_by === person.id || work.created_by_name === fullName(person)); const visits = assigned.filter((work: any) => work.type === 'Visita comercial'); return <Card key={person.id} title={fullName(person)} action={<Link to={`/app/modulos/comerciales/${person.id}`}>Abrir ficha</Link>}><InfoGrid items={[[ 'Email', person.email ?? '-' ], [ 'Teléfono', person.phone ?? '-' ], [ 'Visitas', String(visits.length) ], [ 'Partes comerciales', String(assigned.length) ], [ 'Carga abierta', String(assigned.filter((work: any) => !['Enviado','Cerrado','Cancelado'].includes(work.status)).length) ]]} /></Card>; })}</div></StateBlock></section>;
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

function NotFound() {
  const location = useLocation();
  const technicianProfileMatch = location.pathname.match(/^\/app\/modulos\/tecnicos\/([^/]+)$/);
  if (technicianProfileMatch) return <OperationalProfilePage profileId={technicianProfileMatch[1]} role="Tecnico" />;
  const commercialProfileMatch = location.pathname.match(/^\/app\/modulos\/comerciales\/([^/]+)$/);
  if (commercialProfileMatch) return <OperationalProfilePage profileId={commercialProfileMatch[1]} role="Comercial" />;
  if (location.pathname === '/app/plantillas') return <SuperadminTemplates />;
  const superadminClientMatch = location.pathname.match(/^\/app\/superadmin\/clientes\/([^/]+)$/);
  if (superadminClientMatch) return <SuperadminGuard><ClientDetailPage forcedId={superadminClientMatch[1]} /></SuperadminGuard>;
  const superadminSiteMatch = location.pathname.match(/^\/app\/superadmin\/centros\/([^/]+)$/);
  if (superadminSiteMatch) return <SuperadminGuard><SuperadminSiteDetail id={superadminSiteMatch[1]} /></SuperadminGuard>;
  const superadminEquipmentMatch = location.pathname.match(/^\/app\/superadmin\/equipos\/([^/]+)$/);
  if (superadminEquipmentMatch) return <SuperadminGuard><SuperadminEquipmentDetail id={superadminEquipmentMatch[1]} /></SuperadminGuard>;
  const superadminWorkOrderMatch = location.pathname.match(/^\/app\/superadmin\/partes\/([^/]+)$/);
  if (superadminWorkOrderMatch) return <SuperadminGuard><WorkOrderDetailPageV2 forcedId={superadminWorkOrderMatch[1]} /></SuperadminGuard>;
  const superadminCaseMatch = location.pathname.match(/^\/app\/superadmin\/expedientes\/([^/]+)$/);
  if (superadminCaseMatch) return <SuperadminGuard><CaseDetailPage forcedId={superadminCaseMatch[1]} /></SuperadminGuard>;
  const superadminCheckBlockMatch = location.pathname.match(/^\/app\/superadmin\/checks\/([^/]+)\/bloque\/([^/]+)$/);
  if (superadminCheckBlockMatch) return <SuperadminGuard><CheckBlockPageV2 forcedId={superadminCheckBlockMatch[1]} forcedBlockId={superadminCheckBlockMatch[2]} /></SuperadminGuard>;
  const superadminCheckMatch = location.pathname.match(/^\/app\/superadmin\/checks\/([^/]+)$/);
  if (superadminCheckMatch) return <SuperadminGuard><CheckDetailPage forcedId={superadminCheckMatch[1]} /></SuperadminGuard>;
  const superadminRoutes: Record<string, ReactNode> = {
    '/app/superadmin/usuarios': <SuperadminUsers />,
    '/app/superadmin/usuarios/nuevo': <SuperadminUserCreate />,
    '/app/superadmin/users': <Navigate to="/app/superadmin/usuarios" replace />,
    '/app/superadmin/users/new': <Navigate to="/app/superadmin/usuarios/nuevo" replace />,
    '/app/superadmin/roles': <SuperadminRoles />,
    '/app/superadmin/permissions': <SuperadminRoles />,
    '/app/superadmin/clientes': <ClientsPage />,
    '/app/superadmin/clients': <Navigate to="/app/superadmin/clientes" replace />,
    '/app/superadmin/centros': <SitesPage />,
    '/app/superadmin/centers': <Navigate to="/app/superadmin/centros" replace />,
    '/app/superadmin/equipos': <EquipmentPage />,
    '/app/superadmin/equipment': <Navigate to="/app/superadmin/equipos" replace />,
    '/app/superadmin/partes': <WorkOrdersPage />,
    '/app/superadmin/work-orders': <Navigate to="/app/superadmin/partes" replace />,
    '/app/superadmin/expedientes': <CasesPage />,
    '/app/superadmin/cases': <Navigate to="/app/superadmin/expedientes" replace />,
    '/app/superadmin/checks': <ChecksPage />,
    '/app/superadmin/plantillas': <SuperadminTemplates />,
    '/app/superadmin/check-templates': <Navigate to="/app/superadmin/plantillas" replace />,
    '/app/superadmin/sincronizacion': <SuperadminSync />,
    '/app/superadmin/sync': <Navigate to="/app/superadmin/sincronizacion" replace />,
    '/app/superadmin/auditoria': <SuperadminAudit />,
    '/app/superadmin/audit': <Navigate to="/app/superadmin/auditoria" replace />,
    '/app/superadmin/configuracion': <SuperadminSettings />,
    '/app/superadmin/settings': <Navigate to="/app/superadmin/configuracion" replace />,
  };
  const page = superadminRoutes[location.pathname];
  if (page) return <SuperadminGuard>{page}</SuperadminGuard>;
  return <section className="page"><Card title="Página no encontrada"><p className="large-note">La ruta no existe o no está disponible para este perfil.</p><Link className="primary" to="/app/inicio">Volver al inicio</Link></Card></section>;
}

function OperationalProfileRoute({ role }: { role: 'Tecnico' | 'Comercial' }) {
  const { profileId = '' } = useParams();
  return <OperationalProfilePage profileId={profileId} role={role} />;
}

function SuperadminClientDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useLoad(() => clientsService.get(id), [id], null as any);
  const [mode, setMode] = useState<'edit' | 'contact' | 'site' | 'equipment' | 'work' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  return <section className="page"><BackButton /><Hero title={data.legal_name} subtitle={`${data.code} · ${data.status}`} tone={severityForStatus(data.status)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar cliente</button><button onClick={() => setMode('contact')}>Añadir contacto</button><button onClick={() => setMode('site')}>Crear centro</button><button onClick={() => setMode('equipment')}>Crear equipo</button><button onClick={() => setMode('work')}>Crear parte</button></div><div className="grid two-one"><Card title="Datos del cliente"><InfoGrid items={[[ 'Empresa', data.company_id ], [ 'Código', data.code ], [ 'Razón social', data.legal_name ], [ 'Nombre comercial', data.trade_name ?? '-' ], [ 'NIF', data.tax_id ?? '-' ], [ 'Dirección', data.address ?? '-' ], [ 'Localidad', data.city ?? '-' ], [ 'Provincia', data.province ?? '-' ], [ 'CP', data.postal_code ?? '-' ], [ 'País', data.country ?? '-' ], [ 'Teléfono', data.phone ?? '-' ], [ 'Correo', data.email ?? '-' ], [ 'Observaciones', data.notes ?? '-' ]]} /></Card><Card title="Contactos"><CompactRows rows={(data.client_contacts ?? []).map((item: any) => [fullName(item), `${item.role ?? '-'} · ${item.email ?? '-'} · ${item.phone ?? '-'}`, item.is_primary ? 'ok' : 'info', `/app/superadmin/clientes/${data.id}`])} empty="Sin contactos." /></Card></div><Related title="Relaciones" groups={[[ 'Centros', data.sites, '/app/superadmin/centros'], ['Equipos', data.equipment, '/app/superadmin/equipos'], ['Expedientes', data.cases, '/app/superadmin/expedientes'], ['Partes', data.work_orders, '/app/superadmin/partes']]} />{mode === 'edit' && <ClientForm title="Modificar cliente" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'contact' && <ContactForm clientId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'site' && <SiteForm title="Crear centro" initial={{ company_id: data.company_id, client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'equipment' && <EquipmentForm initial={{ company_id: data.company_id, client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ company_id: data.company_id, client_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>;
}

function SuperadminSiteDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useLoad(() => sitesService.get(id), [id], null as any);
  const [mode, setMode] = useState<'edit' | 'contact' | 'equipment' | 'work' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  return <section className="page"><BackButton /><Hero title={data.name} subtitle={`${data.code} · ${data.clients?.legal_name ?? ''}`} tone="maintenance" /><div className="actions"><button onClick={() => setMode('edit')}>Modificar centro</button><button onClick={() => setMode('contact')}>Añadir contacto</button><button onClick={() => setMode('equipment')}>Crear equipo</button><button onClick={() => setMode('work')}>Crear parte</button></div><Card title="Datos del centro"><InfoGrid items={[[ 'Empresa', data.company_id ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Dirección', data.address ?? '-' ], [ 'Localidad', data.city ?? '-' ], [ 'Provincia', data.province ?? '-' ], [ 'CP', data.postal_code ?? '-' ], [ 'Horario', data.schedule ?? '-' ], [ 'Requisitos de acceso', data.access_requirements?.description ?? '-' ], [ 'Observaciones', data.notes ?? '-' ]]} /></Card><Related title="Relaciones" groups={[[ 'Equipos instalados', data.equipment, '/app/superadmin/equipos'], ['Expedientes', data.cases, '/app/superadmin/expedientes'], ['Partes', data.work_orders, '/app/superadmin/partes']]} />{mode === 'edit' && <SiteForm title="Modificar centro" initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'contact' && <SiteContactForm siteId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'equipment' && <EquipmentForm initial={{ company_id: data.company_id, client_id: data.client_id, site_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ company_id: data.company_id, client_id: data.client_id, site_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>;
}

function SuperadminEquipmentDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useLoad(() => equipmentService.get(id), [id], null as any);
  const history = useLoad(() => equipmentService.history(id), [id], [] as any[]);
  const [mode, setMode] = useState<'edit' | 'component' | 'work' | 'check' | null>(null);
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.equipment_types?.name ?? 'Equipo'}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar equipo</button><button onClick={() => setMode('component')}>Añadir componente</button><button onClick={() => setMode('work')}>Crear parte</button><button onClick={() => setMode('check')}>Crear check</button></div><Card title="Identificación"><InfoGrid items={[[ 'Empresa', data.company_id ], [ 'Código', data.code ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Ubicación', data.internal_location ?? '-' ], [ 'Fabricante', data.brand ?? '-' ], [ 'Modelo', data.model ?? '-' ], [ 'Serie', data.serial_number ?? '-' ], [ 'Estado', displayStatus(data.status) ], [ 'Criticidad', displayStatus(data.criticality) ]]} /></Card><div className="grid half"><Card title="Componentes"><CompactRows rows={(data.equipment_components ?? []).map((component: any) => [component.component_type, `${component.brand ?? '-'} ${component.model ?? ''} · ${component.status}`, severityForStatus(component.status), `/app/superadmin/equipos/${id}`])} empty="Sin componentes." /></Card><Card title="Historial"><CompactRows rows={history.data.map((item: any) => [displayStatus(item.event_type), `${formatDate(item.event_at)} · ${item.summary ?? ''} · ${item.detail ?? ''}`, severityForStatus(item.detail), item.event_type === 'parte' ? '/app/superadmin/partes' : `/app/superadmin/equipos/${id}`])} empty="Sin historial." /></Card></div>{mode === 'edit' && <EquipmentForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'component' && <ComponentForm equipmentId={data.id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'work' && <WorkOrderForm initial={{ company_id: data.company_id, client_id: data.client_id, site_id: data.site_id, main_equipment_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'check' && <CheckForm initial={{ company_id: data.company_id, equipment_id: data.id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>;
}

function SuperadminWorkOrderDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useLoad(() => workOrdersService.get(id), [id], null as any);
  const [mode, setMode] = useState<'edit' | 'assign' | 'check' | null>(null);
  const [message, setMessage] = useState('');
  const [actionError, setActionError] = useState('');
  if (loading || error || !data) return <StateBlock loading={loading} error={error} retry={reload} empty={!data} />;
  const previous = previousWorkOrderStatus(data.status);
  const advance = async () => { try { setActionError(''); await workOrdersService.changeStatus(data.id, nextWorkOrderStatus(data.status), 'Cambio operativo desde Superadmin'); setMessage('Estado actualizado.'); reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido cambiar el estado.'); } };
  const goBack = async () => { const reason = window.prompt('Motivo de la corrección de estado'); if (!reason) return; try { setActionError(''); await workOrdersService.changeStatus(data.id, previous!, reason, true); setMessage('Estado anterior restaurado.'); reload(); } catch (err) { console.error(err); setActionError(err instanceof Error ? err.message : 'No se ha podido restaurar el estado.'); } };
  return <section className="page"><BackButton /><Hero title={`${data.code} · ${data.title}`} subtitle={`${data.clients?.legal_name ?? ''} · ${data.sites?.name ?? ''}`} tone={severityForStatus(data.status)} /><div className="actions"><button onClick={() => setMode('edit')}>Modificar parte</button><button onClick={() => setMode('assign')}>Asignar técnico</button><button onClick={advance}>Avanzar estado</button><button disabled={!previous} onClick={goBack}>Volver estado</button><button onClick={() => setMode('check')}>Crear check</button>{data.client_id && <Link to={`/app/superadmin/clientes/${data.client_id}`}>Abrir cliente</Link>}{data.site_id && <Link to={`/app/superadmin/centros/${data.site_id}`}>Abrir centro</Link>}{data.main_equipment_id && <Link to={`/app/superadmin/equipos/${data.main_equipment_id}`}>Abrir equipo</Link>}</div>{message && <p className="success-note">{message}</p>}{actionError && <p className="form-error">{actionError}</p>}<Card title="Detalle del parte"><InfoGrid items={[[ 'Empresa', data.company_id ], [ 'Estado', displayStatus(data.status) ], [ 'Prioridad', displayStatus(data.priority) ], [ 'Cliente', data.clients?.legal_name ?? '-' ], [ 'Centro', data.sites?.name ?? '-' ], [ 'Equipo', data.primary_equipment?.code ?? '-' ], [ 'Fecha', data.scheduled_date ?? '-' ], [ 'Hora', data.scheduled_time ?? '-' ], [ 'Origen', data.origin ?? '-' ], [ 'Descripción', data.description ?? '-' ]]} /></Card><Card title="Asignaciones, checks y relaciones"><CompactRows rows={[...(data.assignments ?? []).map((item: any) => [fullName(item.profiles), `${item.assignment_date ?? '-'} · ${item.planned_start_time ?? 'Sin hora'} · ${displayStatus(item.status)}`, 'info', `/app/superadmin/partes/${data.id}`]), ...(data.checks ?? []).map((check: any) => [check.code, `${displayStatus(check.status)} · ${displayStatus(check.global_result)}`, severityForStatus(check.global_result), `/app/superadmin/checks/${check.id}`]), ...(data.deficiencies ?? []).map((def: any) => [def.code, `${displayStatus(def.severity)} · ${displayStatus(def.status)}`, severityForPriority(def.severity), '/app/deficiencias'])]} empty="Sin asignaciones ni checks vinculados." /></Card>{mode === 'edit' && <WorkOrderForm initial={data} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'assign' && <AssignmentForm workOrderId={data.id} companyId={data.company_id} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}{mode === 'check' && <CheckForm initial={{ company_id: data.company_id, work_order_id: data.id, equipment_id: data.main_equipment_id }} onClose={() => setMode(null)} onSaved={() => { setMode(null); reload(); }} />}</section>;
}

function OperationalProfilePage({ profileId, role }: { profileId: string; role: 'Tecnico' | 'Comercial' }) {
  const { profile } = useAuth();
  const [assigning, setAssigning] = useState(false);
  const people = useLoad(() => role === 'Tecnico' ? profilesService.listTechnicians() : profilesService.listCommercials(), [role], [] as any[]);
  const works = useLoad(() => workOrdersService.listWithAssignments(), [], [] as any[]);
  const checks = useLoad(() => checksService.pending(), [], [] as any[]);
  const person = people.data.find((item) => item.id === profileId);
  const canManage = canAssignTechnician(profile);
  const assignedWorks = works.data.filter((work: any) => role === 'Tecnico' ? (work.assignments ?? []).some((item: any) => item.technician_id === profileId && !item.deleted_at) || work.main_technician_id === profileId : work.current_responsible_id === profileId || work.created_by === profileId || work.created_by_name === fullName(person));
  const assignedChecks = checks.data.filter((check: any) => check.technician_id === profileId || check.technician_name === fullName(person));
  const unassign = async (workId: string) => { await workOrdersService.unassign(workId, profileId); works.reload(); };
  if (people.loading || works.loading || checks.loading) return <StateBlock loading retry={() => { people.reload(); works.reload(); checks.reload(); }} empty={false} />;
  if (people.error || works.error || checks.error || !person) return <StateBlock loading={false} error={people.error || works.error || checks.error || 'No se ha encontrado la ficha solicitada.'} retry={() => { people.reload(); works.reload(); checks.reload(); }} empty={false} />;
  const activeToday = assignedWorks.filter((work: any) => work.scheduled_date === new Date().toISOString().slice(0, 10));
  const openWorks = assignedWorks.filter((work: any) => !['Enviado','Cerrado','Cancelado'].includes(work.status));
  return <section className="page"><BackButton /><Hero title={`${role === 'Tecnico' ? 'Ficha técnico' : 'Ficha comercial'} · ${fullName(person)}`} subtitle={`${person.email ?? '-'} · ${person.phone ?? '-'} · ${person.active ? 'Activo' : 'Inactivo'}`} tone={role === 'Tecnico' ? 'maintenance' : 'commercial'} /><div className="actions">{canManage && <button onClick={() => setAssigning(true)}>{role === 'Tecnico' ? 'Asignar parte' : 'Asignar visita/parte'}</button>}<Link to="/app/partes">Ver partes</Link><Link to="/app/checks">Ver checks</Link></div><div className="stats-grid"><Card title="Datos"><InfoGrid items={[[ 'Nombre', fullName(person) ], [ 'Rol', areaLabel(person.primary_area) ], [ 'Email', person.email ?? '-' ], [ 'Teléfono', person.phone ?? '-' ], [ 'Estado', person.active ? 'Activo' : 'Inactivo' ]]} /></Card><Card title="Carga de trabajo"><InfoGrid items={[[ 'Partes asignados', assignedWorks.length ], [ 'Abiertos', openWorks.length ], [ 'Hoy', activeToday.length ], [ 'Checks pendientes', assignedChecks.length ], [ 'Disponibilidad', !person.active ? 'Fuera de servicio' : openWorks.some((work: any) => ['En desplazamiento','En intervencion','Pausado'].includes(work.status)) ? 'Ocupado' : 'Disponible' ]]} /></Card></div><Card title={role === 'Tecnico' ? 'Partes asignados' : 'Visitas y partes comerciales'}><CompactRows rows={assignedWorks.map((work: any) => [work.code, `${work.title} · ${work.client_name ?? '-'} · ${displayStatus(work.status)} · ${work.scheduled_date ?? 'Sin fecha'}`, severityForStatus(work.status), `/app/partes/${work.id}`])} empty="Sin partes asignados." />{canManage && assignedWorks.length > 0 && <div className="row-actions ops-actions">{assignedWorks.map((work: any) => <button key={work.id} onClick={() => unassign(work.id)}>Desasignar {work.code}</button>)}</div>}</Card><Card title="Checks asignados"><CompactRows rows={assignedChecks.map((check: any) => [check.code, `${check.equipment_code ?? 'Equipo'} · ${displayStatus(check.status)} · ${displayStatus(check.global_result)}`, severityForStatus(check.global_result), `/app/checks/${check.id}`])} empty="Sin checks asignados." /></Card><Card title="Historial"><CompactRows rows={assignedWorks.slice(0, 8).map((work: any) => [work.code, `${formatDate(work.created_at)} · ${displayStatus(work.status)} · ${work.created_by_name ?? '-'}`, severityForStatus(work.status), `/app/partes/${work.id}`])} empty="Sin historial visible." /></Card>{assigning && <OperationalAssignForm role={role} profileId={profileId} workOrders={works.data} onClose={() => setAssigning(false)} onSaved={() => { setAssigning(false); works.reload(); }} />}</section>;
}

function OperationalAssignForm({ role, profileId, workOrders, onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>({ assignment_date: new Date().toISOString().slice(0, 10), role: 'Principal' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const candidates = workOrders.filter((work: any) => !['Enviado','Cerrado','Cancelado'].includes(work.status));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (role === 'Tecnico') await workOrdersService.assign(values.work_order_id, profileId, values.assignment_date, values.planned_start_time || null, values.planned_end_time || null, values.role || 'Principal');
      else await workOrdersService.assignCommercial(values.work_order_id, profileId);
      onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido asignar.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title={role === 'Tecnico' ? 'Asignar parte a técnico' : 'Asignar visita/parte a comercial'} onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel="Asignar"><FormSelect label="Parte / visita" value={values.work_order_id} onChange={(value) => setValues({ ...values, work_order_id: value })} required options={candidates.map((work: any) => ({ value: work.id, label: `${work.code} · ${work.title} · ${work.client_name ?? '-'}` }))} />{role === 'Tecnico' && <div className="form-grid"><label>Fecha *<input type="date" value={values.assignment_date ?? ''} onChange={(event) => setValues({ ...values, assignment_date: event.target.value })} required /></label><label>Hora inicio<input type="time" value={values.planned_start_time ?? ''} onChange={(event) => setValues({ ...values, planned_start_time: event.target.value })} /></label><label>Hora fin<input type="time" value={values.planned_end_time ?? ''} onChange={(event) => setValues({ ...values, planned_end_time: event.target.value })} /></label><FormSelect label="Rol" value={values.role} onChange={(value) => setValues({ ...values, role: value })} options={['Principal','Apoyo'].map((value) => ({ value, label: value }))} /></div>}</ModalForm>;
}

function GlobalSearch({ query, setQuery }: { query: string; setQuery: (value: string) => void }) {
  const navigate = useNavigate();
  const { workspace } = useAuth();
  const requestRef = useRef(0);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const trimmed = query.trim();
  useEffect(() => {
    const requestId = ++requestRef.current;
    if (!trimmed) { setData([]); setLoading(false); setSearchError(''); return; }
    setLoading(true); setSearchError('');
    const timer = window.setTimeout(async () => {
      try {
        const rows = workspace === 'tecnico' ? await searchService.technician(trimmed) : await searchService.global(trimmed);
        if (requestRef.current === requestId) setData(rows);
      } catch (error) {
        console.error('No se ha podido ejecutar la búsqueda global', error);
        if (requestRef.current === requestId) { setData([]); setSearchError(error instanceof Error ? error.message : 'No se ha podido buscar.'); }
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [trimmed, workspace]);
  const open = (item: any) => { setQuery(''); navigate(item.route); };
  return <div className="search-wrap"><label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={workspace === 'tecnico' ? 'Buscar mis trabajos y checks...' : 'Buscar cliente, equipo, expediente, parte...'} /></label>{trimmed && <div className="search-results">{loading && <p>Buscando...</p>}{!loading && searchError && <p className="form-error">{searchError}</p>}{!loading && !searchError && data.slice(0, 8).map((item) => <button key={`${item.route}-${item.id}`} onClick={() => open(item)}><Badge tone="info">{item.kind ?? 'Resultado'}</Badge><span>{item.title}</span><small>{item.subtitle ?? 'Registro Supabase'}</small></button>)}{!loading && !searchError && !data.length && <p>Sin resultados.</p>}</div>}</div>;
}

function SuperadminUserForm({ initial, onClose, onSaved }: any) {
  const roleOptions = ['superadmin','Gerencia','SAT','Comercial','Oficina','Tecnico'];
  const [values, setValues] = useState<Record<string, any>>({ first_name: '', last_name: '', email: '', phone: '', primary_area: 'SAT', active: true, roles: initial ? rolesList(initial) : ['SAT'], invitation_mode: 'invite', ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const toggleRole = (role: string) => setValues((current) => ({ ...current, roles: toggleExclusiveRole(current.roles ?? [], role), primary_area: role === 'SAT' || role === 'Comercial' ? role : current.primary_area }));
  useEffect(() => { const roles = selectPrimaryRole(values.roles ?? [], values.primary_area); if (roles.join('|') !== (values.roles ?? []).join('|')) set('roles', roles); }, [values.primary_area, (values.roles ?? []).join('|')]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const profilePayload = { first_name: values.first_name, last_name: values.last_name, email: values.email, phone: values.phone || null, primary_area: values.primary_area, active: values.active === true || values.active === 'true', auth_user_id: values.auth_user_id || null, company_id: values.company_id || null };
      await superadminService.saveProfileWithRoles(initial?.id ?? null, profilePayload, values.roles?.length ? values.roles : [values.primary_area]);
      onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar el usuario.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title={initial?.id ? 'Editar usuario' : 'Crear usuario'} onClose={onClose} onSubmit={submit} saving={saving} error={error} submitLabel={initial?.id ? 'Guardar usuario' : 'Crear perfil'}><p className="large-note">No se guarda ni se muestra ninguna contraseña. Para alta Auth real usa invitación o creación en Supabase Auth mediante backend seguro y enlaza auth_user_id.</p><p className="large-note">Regla de roles: SAT y Comercial son incompatibles en el mismo perfil. Al seleccionar uno se desmarca el otro inmediatamente.</p><div className="form-grid"><label>Nombre *<input value={values.first_name ?? ''} onChange={(event) => set('first_name', event.target.value)} required /></label><label>Apellidos *<input value={values.last_name ?? ''} onChange={(event) => set('last_name', event.target.value)} required /></label><label>Email *<input type="email" value={values.email ?? ''} onChange={(event) => set('email', event.target.value)} required /></label><label>Teléfono<input value={values.phone ?? ''} onChange={(event) => set('phone', event.target.value)} /></label><label>auth_user_id<input value={values.auth_user_id ?? ''} onChange={(event) => set('auth_user_id', event.target.value)} placeholder="UUID de auth.users.id" /></label><FormSelect label="Rol principal" value={values.primary_area} onChange={(value) => set('primary_area', value)} required options={roleOptions.map((value) => ({ value, label: value === 'superadmin' ? 'Propietario DMP' : value }))} /><FormSelect label="Estado" value={String(values.active)} onChange={(value) => set('active', value)} options={[{ value: 'true', label: 'Activo' }, { value: 'false', label: 'Inactivo' }]} /></div><Card title="Roles adicionales"><div className="component-select">{roleOptions.map((role) => <label key={role}><input type="checkbox" checked={values.roles.includes(role)} onChange={() => toggleRole(role)} /> {role === 'superadmin' ? 'Propietario DMP' : role}</label>)}</div></Card><Card title="Vinculaciones"><p className="large-note">Vincular con técnico o comercial se resuelve usando el mismo perfil DMP y sus roles. Si se crea una tabla específica de vínculos, debe gestionarse desde RPC segura.</p></Card><p className="state-warning"><ShieldAlert size={16} />Contraseña protegida. No se mostrará después de crear, no se guarda en tablas públicas y no se registra en consola.</p></ModalForm>;
}

function ClientForm({ title, initial, onClose, onSaved }: any) { const fields = [['legal_name','Razón social',true],['trade_name','Nombre comercial'],['tax_id','NIF'],['status','Estado'],['address','Dirección'],['city','Localidad'],['province','Provincia'],['postal_code','Código postal'],['country','País'],['phone','Teléfono'],['email','Correo'],['notes','Observaciones']]; return <EntityForm title={title} fields={fields} initial={{ status: 'Activo', country: 'Espana', ...initial }} help={!initial?.id ? 'El código de cliente se generará automáticamente al guardar.' : undefined} errorMessage={initial?.id ? 'No se ha podido modificar el cliente.' : 'No se ha podido crear el cliente.'} onClose={onClose} onSubmit={(values: any) => initial?.id ? clientsService.update(initial.id, values) : clientsService.create(values)} onSaved={onSaved} />; }
function ContactForm({ clientId, onClose, onSaved }: any) { return <EntityForm title="Añadir contacto" fields={[[ 'first_name','Nombre',true ],[ 'last_name','Apellidos' ],[ 'role','Cargo' ],[ 'email','Correo' ],[ 'phone','Teléfono' ],[ 'notes','Observaciones' ]]} onClose={onClose} onSubmit={(values: any) => clientsService.addContact(clientId, values)} onSaved={onSaved} />; }
function SiteForm({ title, initial, onClose, onSaved }: any) { const clients = useLoad(() => clientsService.list('', initial?.company_id), [initial?.company_id], [] as any[]); return <EntityForm title={title} fields={[[ 'client_id','Cliente',true ],[ 'name','Nombre',true ],[ 'address','Dirección' ],[ 'city','Localidad' ],[ 'province','Provincia' ],[ 'postal_code','Código postal' ],[ 'country','País' ],[ 'schedule','Horario' ],[ 'notes','Observaciones' ]]} selects={{ client_id: clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` })) }} initial={{ country: 'Espana', ...initial }} help={!initial?.id ? 'El código de centro se generará automáticamente al guardar.' : undefined} onClose={onClose} onSubmit={(values: any) => initial?.id ? sitesService.update(initial.id, values) : sitesService.create(values)} onSaved={onSaved} />; }
function SiteContactForm({ siteId, onClose, onSaved }: any) { return <EntityForm title="Añadir contacto de centro" fields={[[ 'first_name','Nombre',true ],[ 'last_name','Apellidos' ],[ 'role','Cargo' ],[ 'email','Correo' ],[ 'phone','Teléfono' ]]} onClose={onClose} onSubmit={(values: any) => sitesService.addContact(siteId, values)} onSaved={onSaved} />; }
function EquipmentForm({ initial, onClose, onSaved }: any) {
  const clients = useLoad(() => clientsService.list('', initial?.company_id), [initial?.company_id], [] as any[]);
  const sites = useLoad(() => sitesService.list('', initial?.company_id), [initial?.company_id], [] as any[]);
  const types = useLoad(() => equipmentService.types(initial?.company_id), [initial?.company_id], [] as any[]);
  const [values, setValues] = useState<Record<string, any>>({ status: 'Operativo', criticality: 'Media', ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const filteredSites = sites.data.filter((site) => !values.client_id || site.client_id === values.client_id);
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await (initial?.id ? equipmentService.update(initial.id, values) : equipmentService.create(values));
      onSaved?.();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar el equipo.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title={initial?.id ? 'Modificar equipo' : 'Crear equipo'} onClose={onClose} onSubmit={submit} saving={saving} error={error}><p className="large-note">{!initial?.id ? 'El código de equipo se generará automáticamente al guardar.' : 'El centro disponible depende del cliente seleccionado.'}</p><FormSelect label="Cliente" value={values.client_id} onChange={(value) => setValues((current) => ({ ...current, client_id: value, site_id: '' }))} required options={clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` }))} loading={clients.loading} /><FormSelect label="Centro" value={values.site_id} onChange={(value) => set('site_id', value)} required options={filteredSites.map((site) => ({ value: site.id, label: `${site.code} · ${site.name}` }))} loading={sites.loading} disabled={!values.client_id} /><FormSelect label="Tipo de equipo" value={values.equipment_type_id} onChange={(value) => set('equipment_type_id', value)} required options={types.data.map((type) => ({ value: type.id, label: type.name }))} loading={types.loading} /><div className="form-grid"><label>Marca<input value={values.brand ?? ''} onChange={(event) => set('brand', event.target.value)} /></label><label>Modelo<input value={values.model ?? ''} onChange={(event) => set('model', event.target.value)} /></label><label>Serie<input value={values.serial_number ?? ''} onChange={(event) => set('serial_number', event.target.value)} /></label><label>Fecha instalación<input type="date" value={values.installation_date ?? ''} onChange={(event) => set('installation_date', event.target.value)} /></label><label>Ubicación<input value={values.internal_location ?? ''} onChange={(event) => set('internal_location', event.target.value)} /></label><FormSelect label="Estado" value={values.status} onChange={(value) => set('status', value)} options={['Operativo','En revision','Averiado','Retirado'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Criticidad" value={values.criticality} onChange={(value) => set('criticality', value)} options={['Baja','Media','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /></div><label>Observaciones<textarea value={values.notes ?? ''} onChange={(event) => set('notes', event.target.value)} /></label></ModalForm>;
}
function ComponentForm({ equipmentId, onClose, onSaved }: any) { return <EntityForm title="Añadir componente" fields={[[ 'component_type','Tipo',true ],[ 'brand','Marca' ],[ 'model','Modelo' ],[ 'serial_number','Serie' ],[ 'status','Estado' ],[ 'notes','Observaciones' ]]} initial={{ status: 'Operativo' }} onClose={onClose} onSubmit={(values: any) => equipmentService.addComponent(equipmentId, values)} onSaved={onSaved} />; }
function CaseForm({ title, initial, onClose, onSaved }: any) { const clients = useLoad(() => clientsService.list('', initial?.company_id), [initial?.company_id], [] as any[]); const sites = useLoad(() => sitesService.list('', initial?.company_id), [initial?.company_id], [] as any[]); const fields = [[ 'title','Título',true ],[ 'description','Descripción' ],[ 'type','Tipo',true ],[ 'priority','Prioridad' ],[ 'status','Estado' ],[ 'client_id','Cliente',true ],[ 'site_id','Centro' ],[ 'origin','Origen',true ]]; return <EntityForm title={title} fields={fields} selects={{ client_id: clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` })), site_id: sites.data.filter((site) => !initial?.client_id || site.client_id === initial.client_id).map((site) => ({ value: site.id, label: `${site.code} · ${site.name}` })) }} initial={{ type: 'Averia', priority: 'Normal', status: 'Abierto', origin: 'SAT', ...initial }} help={!initial?.id ? 'El código de expediente se generará automáticamente al guardar.' : undefined} onClose={onClose} onSubmit={(values: any) => initial?.id ? casesService.update(initial.id, values) : casesService.create(values)} onSaved={onSaved} />; }

function CaseQuickCreate({ initial, onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>({ title: '', description: '', type: 'Averia', priority: 'Normal', status: 'Abierto', origin: 'SAT', ...initial });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try { onSaved(await casesService.create(values)); }
    catch (err) { setError(formErrorMessage(err, 'No se ha podido crear el expediente.')); }
    finally { setSaving(false); }
  };
  return <div className="nested-form"><h4>Crear expediente</h4><p className="large-note">El código se generará automáticamente al guardar.</p><label>Título<input value={values.title} onChange={(event) => set('title', event.target.value)} required /></label><label>Descripción<textarea value={values.description} onChange={(event) => set('description', event.target.value)} /></label><div className="form-grid"><FormSelect label="Tipo" value={values.type} onChange={(value) => set('type', value)} options={['Averia','Mantenimiento','Obra','Inspeccion','Garantia','Reclamacion','Mejora','Comercial'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Prioridad" value={values.priority} onChange={(value) => set('priority', value)} options={['Baja','Normal','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /></div>{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar expediente</button><button type="button" className="primary" onClick={submit} disabled={saving}>{saving ? 'Creando...' : 'Crear y seleccionar'}</button></div></div>;
}
function WorkOrderForm({ initial, onClose, onSaved }: any) {
  const { workspace } = useAuth();
  const creatorRole = workspace === 'superadmin' ? 'SAT' : workspaceToRole[workspace];
  const [values, setValues] = useState<Record<string, any>>({ type: 'Correctivo', priority: 'Normal', origin: creatorRole, scheduled_date: new Date().toISOString().slice(0, 10), ...initial });
  const [creatingCase, setCreatingCase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const clients = useLoad(() => clientsService.list('', initial?.company_id), [initial?.company_id], [] as any[]);
  const sites = useLoad(() => sitesService.list('', initial?.company_id), [initial?.company_id], [] as any[]);
  const equipment = useLoad(() => equipmentService.list('', initial?.company_id), [initial?.company_id], [] as any[]);
  const cases = useLoad(() => casesService.list('', initial?.company_id), [initial?.company_id], [] as any[]);
  const technicians = useLoad(() => profilesService.listTechnicians(initial?.company_id), [initial?.company_id], [] as any[]);
  const filteredSites = sites.data.filter((site) => !values.client_id || site.client_id === values.client_id);
  const filteredEquipment = equipment.data.filter((item) => (!values.client_id || item.client_id === values.client_id) && (!values.site_id || item.site_id === values.site_id));
  const filteredCases = cases.data.filter((item) => (!values.client_id || item.client_id === values.client_id) && (!values.site_id || !item.site_id || item.site_id === values.site_id) && !['Cerrado', 'Cancelado'].includes(item.status));
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...values, estimated_duration_minutes: values.estimated_duration_minutes ? Number(values.estimated_duration_minutes) : null };
      const result = initial?.id ? await workOrdersService.update(initial.id, payload) : await workOrdersService.create(payload, creatorRole);
      onSaved?.(result?.id ?? result);
    } catch (err) { setError(formErrorMessage(err, initial?.id ? 'No se ha podido modificar el parte.' : 'No se ha podido crear el parte.')); }
    finally { setSaving(false); }
  };
  return <ModalForm title={initial?.id ? 'Modificar parte' : 'Crear parte'} onClose={onClose} onSubmit={submit} saving={saving} error={error}><FormSelect label="Cliente" value={values.client_id} onChange={(value) => setValues((current) => ({ ...current, client_id: value, site_id: '', main_equipment_id: '', case_id: '' }))} required options={clients.data.map((client) => ({ value: client.id, label: `${client.code} · ${client.legal_name}` }))} loading={clients.loading} /><FormSelect label="Centro" value={values.site_id} onChange={(value) => setValues((current) => ({ ...current, site_id: value, main_equipment_id: '', case_id: '' }))} required={filteredSites.length > 0} options={filteredSites.map((site) => ({ value: site.id, label: `${site.code} · ${site.name}` }))} loading={sites.loading} disabled={!values.client_id} /><FormSelect label="Equipo" value={values.main_equipment_id} onChange={(value) => set('main_equipment_id', value)} options={filteredEquipment.map((item) => ({ value: item.id, label: `${item.code} · ${item.equipment_types?.name ?? item.model ?? 'Equipo'}` }))} loading={equipment.loading} disabled={!values.site_id} /><div className="field-with-action"><FormSelect label="Expediente" value={values.case_id} onChange={(value) => set('case_id', value)} options={filteredCases.map((item) => ({ value: item.id, label: `${item.code} · ${item.title} · ${displayStatus(item.type)} · ${displayStatus(item.status)}` }))} loading={cases.loading} disabled={!values.client_id} />{values.client_id && !cases.loading && !filteredCases.length && <p className="large-note">No hay expedientes activos para este cliente.</p>}<button type="button" onClick={() => setCreatingCase(true)} disabled={!values.client_id}>Crear expediente</button></div><div className="form-grid"><FormSelect label="Tipo" value={values.type} onChange={(value) => set('type', value)} required options={['Averia urgente','Correctivo','Preventivo','Mantenimiento','Inspeccion','Instalacion','Visita tecnica','Visita comercial','Garantia'].map((value) => ({ value, label: displayStatus(value) }))} /><FormSelect label="Prioridad" value={values.priority} onChange={(value) => set('priority', value)} options={['Baja','Normal','Alta','Critica'].map((value) => ({ value, label: displayStatus(value) }))} /></div><label>Título *<input value={values.title ?? ''} onChange={(event) => set('title', event.target.value)} required /></label><label>Avería o descripción<textarea value={values.description ?? ''} onChange={(event) => set('description', event.target.value)} placeholder="Describe la avería, solicitud o trabajo previsto" /></label><div className="form-grid"><label>Fecha<input type="date" value={values.scheduled_date ?? ''} onChange={(event) => set('scheduled_date', event.target.value)} /></label><label>Hora<input type="time" value={values.scheduled_time ?? ''} onChange={(event) => set('scheduled_time', event.target.value)} /></label><label>Duración estimada (min)<input type="number" min="1" value={values.estimated_duration_minutes ?? ''} onChange={(event) => set('estimated_duration_minutes', event.target.value)} /></label><FormSelect label="Técnico" value={values.technician_id} onChange={(value) => set('technician_id', value)} options={technicians.data.map((row) => ({ value: row.id, label: fullName(row) }))} loading={technicians.loading} /></div><label>Material previsto<input value={values.planned_material ?? ''} onChange={(event) => set('planned_material', event.target.value)} /></label><label>Acceso / requisitos<input value={values.access_notes ?? ''} onChange={(event) => set('access_notes', event.target.value)} /></label><label>Observaciones<textarea value={values.notes ?? ''} onChange={(event) => set('notes', event.target.value)} /></label>{creatingCase && <CaseQuickCreate initial={{ client_id: values.client_id, site_id: values.site_id }} onClose={() => setCreatingCase(false)} onSaved={async (created: any) => { set('case_id', typeof created === 'string' ? created : created.id); setCreatingCase(false); await cases.reload(); }} />}</ModalForm>;
}
function AssignmentForm({ workOrderId, companyId, onClose, onSaved }: any) {
  const [values, setValues] = useState<Record<string, any>>({ assignment_date: new Date().toISOString().slice(0, 10), role: 'Principal' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const technicians = useLoad(() => profilesService.listTechnicians(companyId), [companyId], [] as any[]);
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
  const workOrders = useLoad(() => workOrdersService.options(initial?.company_id), [initial?.company_id], [] as any[]);
  const equipment = useLoad(() => equipmentService.list('', initial?.company_id), [initial?.company_id], [] as any[]);
  const selectedEquipment = equipment.data.find((item) => item.id === values.equipment_id);
  const templateCompanyId = selectedEquipment?.company_id ?? initial?.company_id;
  const templates = useLoad(() => selectedEquipment ? checksService.templates(selectedEquipment.equipment_type_id ?? null, templateCompanyId) : Promise.resolve([]), [selectedEquipment?.id, selectedEquipment?.equipment_type_id, templateCompanyId], [] as any[]);
  const activeTemplateCount = useLoad(() => selectedEquipment ? checksService.activeTemplateCount(templateCompanyId) : Promise.resolve(0), [selectedEquipment?.id, templateCompanyId], 0);
  useEffect(() => { if (!templates.loading && templates.data.length === 1 && values.template_id !== templates.data[0].id) set('template_id', templates.data[0].id); if (!templates.loading && values.template_id && !templates.data.some((item) => item.id === values.template_id)) set('template_id', ''); }, [templates.loading, templates.data.length, values.template_id]);
  const set = (key: string, value: any) => setValues((current) => ({ ...current, [key]: value }));
  const selectWorkOrder = (workOrderId: string) => {
    const workOrder = workOrders.data.find((item) => item.id === workOrderId);
    setValues((current) => ({ ...current, work_order_id: workOrderId, equipment_id: workOrder?.main_equipment_id ?? current.equipment_id, template_id: '' }));
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      if (values.template_id && !templates.data.some((item) => item.id === values.template_id)) throw new Error('La plantilla seleccionada no corresponde al tipo de equipo.');
      const result = initial?.id ? await checksService.update(initial.id, values) : await checksService.create(values);
      onSaved?.(result?.id ?? result);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se ha podido guardar el check.'); }
    finally { setSaving(false); }
  };
  return <ModalForm title={initial?.id ? 'Modificar check' : 'Crear check'} onClose={onClose} onSubmit={submit} saving={saving} error={error}><p className="large-note">El código de check se generará automáticamente al guardar. Se selecciona automáticamente la plantilla activa exacta del tipo de equipo; no se ofrecen plantillas globales incompatibles.</p><FormSelect label="Parte relacionado" value={values.work_order_id} onChange={selectWorkOrder} options={workOrders.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.title}` }))} loading={workOrders.loading} /><FormSelect label="Equipo" value={values.equipment_id} onChange={(value) => setValues((current) => ({ ...current, equipment_id: value, template_id: '' }))} required options={equipment.data.map((item) => ({ value: item.id, label: `${item.code} · ${item.equipment_types?.name ?? item.model ?? 'Equipo'}` }))} loading={equipment.loading} /><FormSelect label="Plantilla" value={values.template_id} onChange={(value) => set('template_id', value)} required options={templates.data.map((item) => ({ value: item.id, label: `${item.name} · v${item.version} · ${item.companies?.name ?? 'Global'} · ${item.equipment_types?.name ?? 'Tipo global'}` }))} loading={templates.loading} disabled={!values.equipment_id || !selectedEquipment?.equipment_type_id} />{values.equipment_id && !selectedEquipment?.equipment_type_id && <p className="form-error">El equipo seleccionado no tiene tipo de equipo. Empresa del equipo: {selectedEquipment?.companies?.name ?? selectedEquipment?.company_id ?? 'no informada'}. No se puede validar compatibilidad de plantilla.</p>}{values.equipment_id && selectedEquipment?.equipment_type_id && !templates.loading && !templates.data.length && <p className="form-error">No hay plantilla compatible activa. Empresa del equipo: {selectedEquipment?.companies?.name ?? selectedEquipment?.company_id ?? 'no informada'}. Tipo del equipo: {selectedEquipment?.equipment_types?.name ?? selectedEquipment?.equipment_type_id}. Plantillas activas visibles: {activeTemplateCount.loading ? 'consultando...' : activeTemplateCount.data}.</p>}<FormSelect label="Estado" value={values.status} onChange={(value) => set('status', value)} options={['Por realizar','En curso','Realizado','Cancelado'].map((value) => ({ value, label: value }))} /><FormSelect label="Resultado global" value={values.global_result} onChange={(value) => set('global_result', value)} options={['Sin revisar','Todo favorable','Problema leve','No favorable','Favorable tras intervencion','No aplicable'].map((value) => ({ value, label: displayStatus(value) }))} /><label>Observaciones<textarea value={values.observations ?? ''} onChange={(event) => set('observations', event.target.value)} /></label></ModalForm>;
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

function FormSelect({ label, value, onChange, options, required, loading, disabled, emptyLabel = 'Seleccionar' }: { label: string; value?: string; onChange: (value: string) => void; options: { value: string; label: string }[]; required?: boolean; loading?: boolean; disabled?: boolean; emptyLabel?: string }) {
  return <label>{label}{required ? ' *' : ''}<select value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled || loading}><option value="">{loading ? 'Cargando...' : emptyLabel}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function EntityForm({ title, fields, initial = {}, selects = {}, help, errorMessage, onClose, onSubmit, onSaved }: any) { useOverlayScrollLock(); const [values, setValues] = useState<Record<string, any>>(initial); const [error, setError] = useState(''); const [saving, setSaving] = useState(false); const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(''); try { const result = await onSubmit(values); onSaved?.(result?.id ?? result); } catch (err) { console.error(err); setError(formErrorMessage(err, errorMessage)); } finally { setSaving(false); } }; return <div className="mini-modal" role="dialog" aria-modal="true" onWheel={(event) => event.stopPropagation()} onTouchMove={(event) => event.stopPropagation()}><form onSubmit={submit}><h3>{title}</h3>{help && <p className="large-note">{help}</p>}{fields.map(([key, label, required]: any[]) => selects[key] ? <FormSelect key={key} label={label} value={values[key]} onChange={(value) => setValues({ ...values, [key]: value })} required={Boolean(required)} options={selects[key]} /> : <label key={key}>{label}{required ? ' *' : ''}<input value={values[key] ?? ''} onChange={(event) => setValues({ ...values, [key]: event.target.value })} required={Boolean(required)} /></label>)}{error && <p className="form-error">{error}</p>}<div className="modal-footer"><button type="button" onClick={onClose} disabled={saving}>Cancelar</button><button className="primary" disabled={saving}>{saving ? 'Guardando...' : title}</button></div></form></div>; }
function formErrorMessage(error: unknown, fallback?: string) { const detail = error instanceof Error ? error.message : 'Error al guardar'; if (!fallback) return detail; return detail && detail !== fallback ? `${fallback} ${detail}` : fallback; }

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
function rolesList(profile: any) { return (profile.profile_roles ?? []).map((item: any) => item.roles?.name).filter(Boolean); }
function rolesText(profile: any) { const roles = rolesList(profile); return roles.length ? roles.join(', ') : 'Sin roles'; }
function areaOptions() { return ['superadmin','Gerencia','SAT','Comercial','Oficina','Tecnico']; }
function selectPrimaryRole(roles: string[], primary: string) { const next = [...new Set([primary, ...roles].filter(Boolean))]; if (primary === 'SAT') return next.filter((role) => role !== 'Comercial'); if (primary === 'Comercial') return next.filter((role) => role !== 'SAT'); return next.includes('SAT') ? next.filter((role) => role !== 'Comercial') : next; }
function toggleExclusiveRole(roles: string[], role: string) { const selected = roles.includes(role) ? roles.filter((item) => item !== role) : [...roles, role]; if (role === 'SAT') return selected.filter((item) => item !== 'Comercial'); if (role === 'Comercial') return selected.filter((item) => item !== 'SAT'); return selected.includes('SAT') ? selected.filter((item) => item !== 'Comercial') : selected; }
function normalizeArea(value?: string | null) { return normalize(value ?? '').replace('tecnico', 'tecnico'); }
function areaLabel(value?: string | null) { const labels: Record<string, string> = { superadmin: 'Propietario DMP', gerencia: 'Gerencia', sat: 'SAT', comercial: 'Comercial', oficina: 'Oficina', tecnico: 'Técnico' }; return labels[normalizeArea(value)] ?? displayStatus(value); }
function permissionForRole(role: string, permission: string) {
  return canRole(role, permission);
}
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function normalizeCheckStatus(value?: string | null) { return value === 'Favorable tras intervencion' ? 'Favorable tras intervención' : value || 'Sin revisar'; }
function routeForAlert(alert: any) { if (!alert?.related_entity || !alert?.related_id) return '/app/avisos'; const map: Record<string, string> = { work_orders: '/app/partes', deficiencies: '/app/deficiencias', equipment: '/app/equipos', checks: '/app/checks', clients: '/app/clientes', sites: '/app/centros', cases: '/app/expedientes' }; return `${map[alert.related_entity] ?? '/app/avisos'}/${alert.related_id}`; }
function routeForOperationalItem(item: any) {
  if (item?.related_entity && item?.related_id) return routeForAlert(item);
  if (item?.code?.startsWith('DEF-') || item?.work_order_id || item?.check_id) return `/app/deficiencias/${item.id}`;
  if (item?.code?.startsWith('AVI-')) return `/app/avisos`;
  return item?.id ? `/app/partes/${item.id}` : '/app/partes';
}
function byTemplatePosition(a: any, b: any) { return (a.position ?? 0) - (b.position ?? 0); }
function moveItem<T>(items: T[], from: number, to: number) { const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }

export default App;
