import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Bell, BriefcaseBusiness, Building2, CalendarClock, Car, CheckCircle2, ChevronLeft, ClipboardCheck,
  ClipboardList, DollarSign, Eye, EyeOff, Factory, FileText, Gauge, Home, LogOut, Menu, MoreHorizontal,
  PackageCheck, PanelLeftClose, PanelLeftOpen, PieChart, Search, Settings, ShieldAlert, TrendingUp, Truck, UserRound,
  UsersRound, Warehouse, Wrench, X,
} from 'lucide-react';
import {
  alerts, budgets, centerName, clientName, clients, contracts, equipment, equipmentName, invoices, purchases,
  supplierName, technicianName, technicians, works, type AlertItem, type ProfileId, type Severity, type TechnicianStage,
  type Work,
} from './demoData';

type DemoUser = { id: string; name: string; email: string; password: string; position: string; primary: ProfileId; roles: ProfileId[] };
type Session = { userId: string; workspace: ProfileId; signedIn: true };
type NavItem = { id: string; label: string; path: string; icon: typeof Home };
type Metric = { key: string; label: string; value: string; tone: Severity; icon: ReactNode; route: string };
type WorkRuntime = Record<string, { stage: TechnicianStage; history: string[]; returnRequested?: boolean }>;
type CheckStatus = 'Sin revisar' | 'Favorable' | 'Problema leve' | 'No favorable' | 'Favorable tras intervención' | 'No aplicable';
type CheckBlockId = 'hoja' | 'guias' | 'muelles' | 'automatizacion' | 'estructura' | 'funcionamiento';
type CheckRecord = { id: string; partId: string; workId: string; equipmentId: string; technician: string; date: string; result: string; blocks: Record<CheckBlockId, CheckStatus>; completed?: boolean };

const iconProps = { size: 18, strokeWidth: 2 };
const sessionKey = 'dmp-demo-session';
const sidebarKey = 'dmp-sidebar-collapsed';
const techStageKey = 'dmp-tech-stage';
const techHistoryKey = 'dmp-tech-history';
const workRuntimeKey = 'dmp-work-runtime';
const checksKey = 'dmp-checks';

const demoUsers: DemoUser[] = [
  { id: 'marta', name: 'Marta López', email: 'marta.demo@doormanager.local', password: 'DemoSAT2026', position: 'Coordinación técnica', primary: 'sat', roles: ['sat', 'comercial'] },
  { id: 'laura', name: 'Laura Sánchez', email: 'laura.demo@doormanager.local', password: 'DemoCOM2026', position: 'Gestión comercial', primary: 'comercial', roles: ['comercial'] },
  { id: 'elena', name: 'Elena Ruiz', email: 'elena.demo@doormanager.local', password: 'DemoOFI2026', position: 'Administración', primary: 'oficina', roles: ['oficina'] },
  { id: 'carlos', name: 'Carlos Navarro', email: 'carlos.demo@doormanager.local', password: 'DemoDIR2026', position: 'Dirección', primary: 'gerencia', roles: ['gerencia'] },
  { id: 'diego', name: 'Diego Martín', email: 'diego.demo@doormanager.local', password: 'DemoTEC2026', position: 'Técnico de campo', primary: 'tecnico', roles: ['tecnico'] },
];

const sectionalBlocks: { id: CheckBlockId; name: string; components: string[]; area: React.CSSProperties }[] = [
  { id: 'hoja', name: 'Hoja', components: ['Paneles', 'Herrajes', 'Bisagras', 'Rodillos', 'Juntas', 'Perfil inferior', 'Sistema anticaída'], area: { left: '25%', top: '30%', width: '44%', height: '42%' } },
  { id: 'guias', name: 'Guías', components: ['Guías'], area: { left: '18%', top: '22%', width: '12%', height: '58%' } },
  { id: 'muelles', name: 'Línea de muelles y compensación', components: ['Muelles', 'Eje', 'Tambores', 'Cables', 'Soportes', 'Cojinetes', 'Seguridad de rotura o paracaídas de cable, si existe'], area: { left: '22%', top: '8%', width: '58%', height: '18%' } },
  { id: 'automatizacion', name: 'Automatización, maniobra y seguridad', components: ['Motor directo al eje', 'Desbloqueo manual', 'Cuadro de maniobra', 'Cableado', 'Alimentación y protecciones', 'Finales de carrera o encoder', 'Fotocélulas', 'Banda de seguridad', 'Activación', 'Señalización'], area: { left: '70%', top: '25%', width: '22%', height: '48%' } },
  { id: 'estructura', name: 'Estructura', components: ['Estructura'], area: { left: '8%', top: '14%', width: '15%', height: '70%' } },
  { id: 'funcionamiento', name: 'Funcionamiento general', components: ['Apertura y cierre', 'Equilibrado', 'Suavidad de marcha', 'Ruidos o rozamientos', 'Maniobra manual'], area: { left: '30%', top: '74%', width: '42%', height: '18%' } },
];

const physicalSectionalBlocks = sectionalBlocks.filter((block) => block.id !== 'funcionamiento');

const checkStatuses: CheckStatus[] = ['Sin revisar', 'Favorable', 'Problema leve', 'No favorable', 'Favorable tras intervención', 'No aplicable'];

const technicalDocs = [
  ['Manual instalación SD-420', 'manual de instalación', 'Equipo concreto EQ-SEC-001'],
  ['Manual mantenimiento SD-420', 'manual de mantenimiento', 'Modelo SD-420'],
  ['Motor Nice X2', 'manual del motor', 'Motor'],
  ['Cuadro DM-CTRL', 'manual del cuadro', 'Cuadro de maniobra'],
  ['Esquema eléctrico seccional', 'esquema eléctrico', 'Familia puerta seccional'],
  ['Despiece hoja industrial', 'despiece', 'Componente hoja'],
  ['Declaración CE NovoDemo', 'declaración CE', 'Marca NovoDemo'],
  ['Desbloqueo manual eje', 'instrucciones de desbloqueo', 'Automatización'],
  ['Procedimiento interno SAT-SEC', 'procedimientos internos', 'Cliente Logística Ares'],
] as const;

const workspaceTitles: Record<ProfileId, string> = {
  sat: 'Panel SAT', comercial: 'Panel comercial', oficina: 'Panel oficina', gerencia: 'Panel gerencia', tecnico: 'Trabajo técnico',
};

function App() {
  const [path, navigate] = usePath();
  const [session, setSession] = usePersistentSession();
  const [runtime, setRuntime] = usePersistentRuntime();
  const [checks, setChecks] = usePersistentChecks();
  const user = session ? demoUsers.find((item) => item.id === session.userId) : undefined;

  useEffect(() => {
    if (!session && path !== '/') navigate('/');
    if (session && path === '/') navigate(defaultRoute(session.workspace));
  }, [session, path, navigate]);

  const signIn = (nextUser: DemoUser) => {
    const nextSession: Session = { userId: nextUser.id, workspace: nextUser.primary, signedIn: true };
    setSession(nextSession);
    navigate(defaultRoute(nextUser.primary));
  };

  if (!session || !user) return <LoginPage onSignIn={signIn} />;
  if (session.workspace === 'tecnico') return <TechnicianApp user={user} navigate={navigate} path={path} runtime={runtime} setRuntime={setRuntime} checks={checks} setChecks={setChecks} onLogout={() => logout(setSession, navigate)} />;

  return <DesktopLayout session={session} setSession={setSession} user={user} path={path} navigate={navigate}>{renderRoute(session.workspace, path, navigate, runtime, checks)}</DesktopLayout>;
}

function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(window.location.pathname + window.location.search);
  useEffect(() => {
    const listener = () => setPath(window.location.pathname + window.location.search);
    window.addEventListener('popstate', listener);
    return () => window.removeEventListener('popstate', listener);
  }, []);
  const navigate = (next: string) => {
    if (window.location.pathname + window.location.search !== next) window.history.pushState({}, '', next);
    setPath(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return [path, navigate];
}

function usePersistentSession(): [Session | null, (session: Session | null) => void] {
  const [session, setSessionState] = useState<Session | null>(() => parseSession(localStorage.getItem(sessionKey)));
  const setSession = (next: Session | null) => {
    if (next) localStorage.setItem(sessionKey, JSON.stringify(next));
    else localStorage.removeItem(sessionKey);
    setSessionState(next);
  };
  return [session, setSession];
}

function usePersistentRuntime(): [WorkRuntime, (runtime: WorkRuntime) => void] {
  const [runtime, setState] = useState<WorkRuntime>(() => {
    const stored = localStorage.getItem(workRuntimeKey);
    if (stored) return JSON.parse(stored) as WorkRuntime;
    return defaultRuntime();
  });
  const setRuntime = (next: WorkRuntime) => {
    localStorage.setItem(workRuntimeKey, JSON.stringify(next));
    setState(next);
  };
  return [runtime, setRuntime];
}

function usePersistentChecks(): [CheckRecord[], (checks: CheckRecord[]) => void] {
  const [checks, setState] = useState<CheckRecord[]>(() => JSON.parse(localStorage.getItem(checksKey) ?? '[]') as CheckRecord[]);
  const setChecks = (next: CheckRecord[]) => {
    localStorage.setItem(checksKey, JSON.stringify(next));
    setState(next);
  };
  return [checks, setChecks];
}

function defaultRuntime(): WorkRuntime {
  return {
    'TR-2401': { stage: 'downloaded', history: [`${now()} Trabajo descargado`] },
    'TR-2406': { stage: 'downloaded', history: [`${now()} Trabajo descargado`] },
    'TR-2411': { stage: 'downloaded', history: [`${now()} Trabajo descargado`] },
  };
}

function parseSession(value: string | null): Session | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<Session>;
    if (parsed.signedIn && parsed.userId && parsed.workspace) return parsed as Session;
  } catch { return null; }
  return null;
}

function LoginPage({ onSignIn }: { onSignIn: (user: DemoUser) => void }) {
  const [demoOpen, setDemoOpen] = useState(false);
  const [selected, setSelected] = useState<DemoUser | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const pickDemo = (user: DemoUser) => {
    setSelected(user);
    setEmail(user.email);
    setPassword(user.password);
    setError('');
  };

  const submit = () => {
    setError('');
    const user = demoUsers.find((item) => item.email === email && item.password === password);
    if (!user) {
      setError('Credenciales demo no válidas. Selecciona un usuario de demostración o revisa los datos.');
      return;
    }
    setLoading(true);
    window.setTimeout(() => onSignIn(user), 350);
  };

  return <main className="login-page">
    <section className="login-visual" aria-hidden="true">
      <div className="industrial-mark"><Factory size={42} /><span>DMP</span></div>
      <div className="door-illustration"><span /><span /><span /><i /></div>
      <h1>DoorManager Pro</h1>
      <p>Operaciones, mantenimiento, SAT y gestión empresarial sobre un mismo núcleo de información.</p>
      <div className="visual-tags"><Badge tone="maintenance" icon={<Wrench size={14} />}>SAT</Badge><Badge tone="commercial" icon={<BriefcaseBusiness size={14} />}>Comercial</Badge><Badge tone="info" icon={<Gauge size={14} />}>Dirección</Badge></div>
    </section>
    <section className="login-card" aria-label="Acceso a DoorManager Pro">
      <div className="login-brand"><Factory size={30} /><div><strong>DoorManager Pro</strong><span>Gestión integral para empresas de puertas automáticas</span></div></div>
      <label>Usuario o correo<input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="usuario@empresa.com" autoComplete="username" /></label>
      <label>Contraseña<div className="password-field"><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Contraseña" autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
      <div className="login-row"><label className="check"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Recordarme</label><button type="button" className="text-button">¿Has olvidado tu contraseña?</button></div>
      {error && <p className="form-error"><AlertTriangle size={16} />{error}</p>}
      <button className="primary wide big" onClick={submit} disabled={loading}>{loading ? 'Iniciando sesión...' : 'Iniciar sesión'}</button>
      <button className="demo-toggle" onClick={() => setDemoOpen(!demoOpen)}><UsersRound size={17} /> Acceso de demostración</button>
      {demoOpen && <div className="demo-users">{demoUsers.map((user) => <button key={user.id} className={selected?.id === user.id ? 'selected' : ''} onClick={() => pickDemo(user)}><span>{initials(user.name)}</span><strong>{user.name}</strong><small>{user.position} · {workspaceTitles[user.primary]}</small></button>)}</div>}
      <footer>Versión demo local. Sin autenticación real. Privacidad y seguridad pendientes de implementación backend.</footer>
    </section>
  </main>;
}

function DesktopLayout({ session, setSession, user, path, navigate, children }: { session: Session; setSession: (session: Session | null) => void; user: DemoUser; path: string; navigate: (path: string) => void; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= 760 || localStorage.getItem(sidebarKey) === 'true');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState('');
  const nav = navForWorkspace(session.workspace);
  const active = activeNav(nav, cleanPath(path));
  const profileAlerts = alerts.filter((item) => item.profiles.includes(session.workspace));

  const setWorkspace = (workspace: ProfileId) => {
    const next = { ...session, workspace };
    setSession(next);
    setUserOpen(false);
    navigate(defaultRoute(workspace));
  };

  const toggleSidebar = () => {
    localStorage.setItem(sidebarKey, String(!collapsed));
    setCollapsed(!collapsed);
  };

  return <div className="shell">
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-row"><button className="brand" onClick={() => navigate(defaultRoute(session.workspace))} title="Inicio"><Factory {...iconProps} /><span>DoorManager</span></button><button className="side-toggle" onClick={toggleSidebar} title={collapsed ? 'Expandir menú' : 'Contraer menú'}>{collapsed ? <PanelLeftOpen {...iconProps} /> : <PanelLeftClose {...iconProps} />}</button></div>
      <nav>{nav.map((item) => { const Icon = item.icon; const isActive = active?.id === item.id; return <button key={item.id} className={isActive ? 'active' : ''} onClick={() => navigate(item.path)} title={item.label} aria-current={isActive ? 'page' : undefined}><Icon {...iconProps} /><span>{item.label}</span></button>; })}</nav>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <button className="mobile-menu" onClick={toggleSidebar} title="Menú"><Menu {...iconProps} /></button>
        <div className="top-title"><p className="eyebrow">{workspaceTitles[session.workspace]}</p><h1>{active?.label ?? workspaceTitles[session.workspace]}</h1></div>
        <GlobalSearch workspace={session.workspace} query={query} setQuery={setQuery} navigate={navigate} />
        <button className="icon-btn" onClick={() => setAlertsOpen(true)} title="Centro de avisos" aria-label="Abrir centro de avisos"><Bell {...iconProps} /><b>{profileAlerts.length}</b></button>
        <div className="user-menu-wrap"><button className="user user-button" onClick={() => setUserOpen(!userOpen)}><span>{initials(user.name)}</span><div><strong>{user.name}</strong><small>{user.position}</small></div></button>{userOpen && <><button className="popover-backdrop" aria-label="Cerrar menú de usuario" onClick={() => setUserOpen(false)} /><UserMenu user={user} session={session} setWorkspace={setWorkspace} onReset={() => resetDemo(setSession, navigate)} onLogout={() => logout(setSession, navigate)} onClose={() => setUserOpen(false)} /></>}</div>
      </header>
      <main>{children}</main>
    </div>
    {alertsOpen && <SidePanel title="Centro de avisos" subtitle={workspaceTitles[session.workspace]} onClose={() => setAlertsOpen(false)}><AlertsPanel items={profileAlerts} navigate={navigate} /></SidePanel>}
  </div>;
}

function UserMenu({ user, session, setWorkspace, onReset, onLogout, onClose }: { user: DemoUser; session: Session; setWorkspace: (workspace: ProfileId) => void; onReset: () => void; onLogout: () => void; onClose: () => void }) {
  useEscape(onClose);
  return <div className="user-popover" role="menu"><button><UserRound size={16} /> Mi perfil</button>{user.roles.length > 1 && <div className="workspace-switch"><strong>Cambiar espacio de trabajo</strong>{user.roles.map((role) => <button key={role} className={session.workspace === role ? 'active' : ''} onClick={() => setWorkspace(role)}>{workspaceTitles[role]}</button>)}</div>}<button onClick={onReset}><Settings size={16} /> Restablecer demostración</button><button onClick={onLogout}><LogOut size={16} /> Cerrar sesión</button></div>;
}

function renderRoute(workspace: ProfileId, pathWithQuery: string, navigate: (path: string) => void, runtime: WorkRuntime, checks: CheckRecord[]) {
  const path = cleanPath(pathWithQuery);
  const params = new URLSearchParams(pathWithQuery.split('?')[1] ?? '');
  if (workspace === 'sat') {
    const workId = path.match(/\/app\/trabajos\/([^/]+)/)?.[1];
    const equipmentId = path.match(/\/app\/equipos\/([^/]+)/)?.[1];
    if (workId) return <JobDetail work={withRuntime(works.find((item) => item.id === workId) ?? works[0], runtime)} navigate={navigate} checks={checks} />;
    if (equipmentId) return <EquipmentDetail item={equipment.find((item) => item.id === equipmentId) ?? equipment[0]} navigate={navigate} checks={checks} />;
    if (path === '/app/trabajos') return <WorkDetailList filter={params.get('filtro')} navigate={navigate} runtime={runtime} />;
    if (path === '/app/equipos') return <EquipmentList navigate={navigate} />;
    if (path === '/app/tecnicos') return <TechniciansPage />;
    if (path === '/app/material') return <MaterialDetail navigate={navigate} />;
    if (path === '/app/avisos') return <GenericAlertsPage workspace="sat" navigate={navigate} />;
    return <SatPanel navigate={navigate} runtime={runtime} />;
  }
  if (workspace === 'comercial') {
    if (path === '/app/presupuestos') return <BudgetsDetail status={params.get('estado')} navigate={navigate} />;
    if (path === '/app/oportunidades') return <OpportunitiesDetail navigate={navigate} />;
    if (path === '/app/contratos') return <ContractsDetail />;
    if (path === '/app/avisos') return <GenericAlertsPage workspace="comercial" navigate={navigate} />;
    return <CommercialPanel navigate={navigate} />;
  }
  if (workspace === 'oficina') {
    if (path === '/app/facturacion' || path === '/app/cobros') return <InvoicesDetail filter={params.get('filtro')} />;
    if (path === '/app/compras' || path === '/app/proveedores') return <PurchasesDetail />;
    if (path === '/app/prl') return <PrlDetail />;
    if (path === '/app/vehiculos') return <VehiclesDetail />;
    if (path === '/app/avisos') return <GenericAlertsPage workspace="oficina" navigate={navigate} />;
    return <OfficePanel navigate={navigate} />;
  }
  if (path === '/app/informes' || path === '/app/operaciones') return <ManagementDetail filter={params.get('filtro')} navigate={navigate} />;
  if (path === '/app/avisos') return <GenericAlertsPage workspace="gerencia" navigate={navigate} />;
  return <ManagementPanel navigate={navigate} />;
}

function SatPanel({ navigate, runtime }: { navigate: (path: string) => void; runtime: WorkRuntime }) {
  const satWorks = works.map((work) => withRuntime(work, runtime));
  const metrics: Metric[] = [
    kpi('tecnicos', 'Técnicos disponibles', '2/5', 'ok', <UsersRound {...iconProps} />, '/app/tecnicos?filtro=disponibles'),
    kpi('activos', 'Trabajos activos', '2', 'info', <Wrench {...iconProps} />, '/app/trabajos?filtro=activos'),
    kpi('pendientes', 'Trabajos pendientes', satWorks.filter((work) => !['sent', 'readyToSend'].includes(runtime[work.id]?.stage ?? '') && work.status !== 'cerrado').length.toString(), 'warn', <CalendarClock {...iconProps} />, '/app/trabajos?filtro=pendientes'),
    kpi('ayer', 'No terminados ayer', '1', 'warn', <AlertTriangle {...iconProps} />, '/app/trabajos?filtro=no-terminados'),
    kpi('material', 'Material no confirmado', '3', 'danger', <PackageCheck {...iconProps} />, '/app/material?filtro=no-confirmado'),
    kpi('info', 'Info pendiente', '3', 'info', <FileText {...iconProps} />, '/app/trabajos?filtro=info-pendiente'),
    kpi('prl', 'PRL próximos', '2', 'warn', <ShieldAlert {...iconProps} />, '/app/tecnicos?filtro=prl'),
    kpi('avisos', 'Avisos críticos', '2', 'danger', <Bell {...iconProps} />, '/app/avisos?prioridad=critica'),
  ];
  return <Dashboard title="Panel SAT de hoy" subtitle="Planificación, técnicos, trabajos, material, accesos y avisos operativos." metrics={metrics} navigate={navigate}><div className="grid two-one"><Card title="Trabajos de hoy" icon={<ClipboardList {...iconProps} />}><div className="work-list">{satWorks.slice(0, 7).map((work) => <WorkRow key={work.id} work={work} onClick={() => navigate(`/app/trabajos/${work.id}`)} />)}</div></Card><Card title="Técnicos" icon={<UsersRound {...iconProps} />}><div className="tech-list">{technicians.map((tech) => <TechnicianCard key={tech.id} tech={tech} />)}</div></Card></div></Dashboard>;
}

function CommercialPanel({ navigate }: { navigate: (path: string) => void }) {
  const metrics: Metric[] = [
    kpi('pendientes', 'Presupuestos pendientes', '2', 'commercial', <DollarSign {...iconProps} />, '/app/presupuestos?estado=pendiente'),
    kpi('enviados', 'Presupuestos enviados', '1', 'commercial', <FileText {...iconProps} />, '/app/presupuestos?estado=enviado'),
    kpi('aceptados', 'Presupuestos aceptados', '1', 'ok', <CheckCircle2 {...iconProps} />, '/app/presupuestos?estado=aceptado'),
    kpi('parcial', 'Aceptaciones parciales', '1', 'warn', <AlertTriangle {...iconProps} />, '/app/presupuestos?estado=aceptacion-parcial'),
    kpi('oportunidades', 'Oportunidades abiertas', '4', 'info', <TrendingUp {...iconProps} />, '/app/oportunidades'),
    kpi('contratos', 'Contratos a renovar', '2', 'warn', <CalendarClock {...iconProps} />, '/app/contratos?filtro=renovacion'),
    kpi('ventas', 'Ventas periodo', formatCurrency(19230), 'ok', <TrendingUp {...iconProps} />, '/app/informes-comerciales'),
    kpi('deficiencias', 'Pendiente valorar', '3', 'danger', <Wrench {...iconProps} />, '/app/oportunidades?origen=deficiencias'),
  ];
  return <Dashboard title="Panel comercial" subtitle="Presupuestos, oportunidades, renovaciones y actividad comercial." metrics={metrics} navigate={navigate}><div className="grid half"><Card title="Actividad comercial" icon={<BriefcaseBusiness {...iconProps} />}><CompactList items={[[ 'Seguimiento', 'PRE-3041 pendiente de respuesta de Logística Ares', 'commercial' ], [ 'Visita', 'Ampliación Sur, medición y propuesta inicial', 'info' ], [ 'Cliente activo', 'Centro Órbita revisa renovación de contrato', 'warn' ]]} /></Card><Card title="Oportunidades desde deficiencias" icon={<AlertTriangle {...iconProps} />}><CompactList items={works.filter((work) => work.budgetId).map((work) => [clientName(work.clientId), `${work.equipmentId} · ${work.fault} · ${work.budgetId}`, work.priority])} /></Card></div></Dashboard>;
}

function OfficePanel({ navigate }: { navigate: (path: string) => void }) {
  const metrics: Metric[] = [
    kpi('facturas', 'Facturas pendientes', '3', 'warn', <DollarSign {...iconProps} />, '/app/facturacion?filtro=pendientes'),
    kpi('cobros', 'Cobros vencidos', '1', 'danger', <AlertTriangle {...iconProps} />, '/app/cobros?filtro=vencidos'),
    kpi('proveedor', 'Facturas proveedor', '2', 'warn', <Truck {...iconProps} />, '/app/proveedores?filtro=pendientes'),
    kpi('pedidos', 'Pedidos sin confirmar', '1', 'danger', <Warehouse {...iconProps} />, '/app/compras?filtro=sin-confirmar'),
    kpi('entregas', 'Entregas próximas', '2', 'info', <PackageCheck {...iconProps} />, '/app/compras?filtro=entregas'),
    kpi('prl', 'PRL próximos', '2', 'warn', <ShieldAlert {...iconProps} />, '/app/prl?filtro=proximos'),
    kpi('medicos', 'Reconocimientos', '1', 'info', <UsersRound {...iconProps} />, '/app/prl?filtro=reconocimientos'),
    kpi('itv', 'ITV y vehículos', '2', 'warn', <Car {...iconProps} />, '/app/vehiculos?filtro=vencimientos'),
    kpi('docs', 'Documentos pendientes', '4', 'muted', <FileText {...iconProps} />, '/app/documentos?filtro=pendientes'),
    kpi('avisos', 'Avisos administrativos', '3', 'danger', <Bell {...iconProps} />, '/app/avisos'),
  ];
  return <Dashboard title="Panel oficina" subtitle="Administración, facturación, compras, PRL, vehículos y avisos." metrics={metrics} navigate={navigate}><div className="grid half"><Card title="Facturación y cobros" icon={<DollarSign {...iconProps} />}><CompactList items={invoices.map((invoice) => [invoice.id, `${clientName(invoice.clientId)} · ${invoice.due} · ${formatCurrency(invoice.amount)} · ${invoice.status}`, invoice.status === 'vencida' ? 'danger' : 'warn'])} /></Card><Card title="Compras y proveedores" icon={<Truck {...iconProps} />}><CompactList items={purchases.map((purchase) => [purchase.id, `${supplierName(purchase.supplierId)} · ${purchase.date} · ${purchase.confirmation}`, purchase.confirmation === 'confirmado' ? 'ok' : 'warn'])} /></Card></div></Dashboard>;
}

function ManagementPanel({ navigate }: { navigate: (path: string) => void }) {
  const metrics: Metric[] = [
    kpi('ventas', 'Ventas periodo', formatCurrency(48200), 'ok', <TrendingUp {...iconProps} />, '/app/ventas'),
    kpi('facturacion', 'Facturación', formatCurrency(36910), 'info', <DollarSign {...iconProps} />, '/app/rentabilidad?filtro=facturacion'),
    kpi('coste', 'Coste', formatCurrency(24400), 'warn', <Warehouse {...iconProps} />, '/app/rentabilidad?filtro=costes'),
    kpi('margen', 'Margen', '34%', 'ok', <PieChart {...iconProps} />, '/app/rentabilidad?filtro=margen'),
    kpi('realizados', 'Trabajos realizados', '18', 'ok', <CheckCircle2 {...iconProps} />, '/app/operaciones?filtro=realizados'),
    kpi('pendientes', 'Trabajos pendientes', '9', 'warn', <CalendarClock {...iconProps} />, '/app/operaciones?filtro=pendientes'),
    kpi('garantias', 'Garantías', '2', 'warn', <ShieldAlert {...iconProps} />, '/app/calidad?filtro=garantias'),
    kpi('reclamaciones', 'Reclamaciones', '1', 'danger', <AlertTriangle {...iconProps} />, '/app/calidad?filtro=reclamaciones'),
    kpi('clientes', 'Clientes activos', '4', 'info', <Building2 {...iconProps} />, '/app/clientes'),
  ];
  return <Dashboard title="Panel gerencia" subtitle="Ventas, carga, costes, calidad, clientes y evolución agregada." metrics={metrics} navigate={navigate}><div className="grid half"><Card title="Ventas por mes" icon={<TrendingUp {...iconProps} />}><BarChart values={[22, 31, 28, 44, 39, 48]} labels={['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun']} tone="commercial" /></Card><Card title="Realizados frente a pendientes" icon={<Gauge {...iconProps} />}><DualBars left="Realizados" right="Pendientes" leftValue={18} rightValue={9} /></Card></div><div className="grid half"><Card title="Actividad por intervención" icon={<Wrench {...iconProps} />}><CompactList items={[[ 'Reparación', '38% de la actividad', 'danger' ], [ 'Mantenimiento', '34% de la actividad', 'maintenance' ], [ 'Instalación', '18% de la actividad', 'info' ]]}/></Card><Card title="Alertas principales" icon={<Bell {...iconProps} />}><CompactList items={[[ 'TR-2401', 'Desviación por cambio de motor', 'warn' ], [ 'FAC-2308', 'Factura vencida hace 8 días', 'danger' ], [ 'CON-ARES-24', 'Renovación próxima', 'commercial' ]]} /></Card></div></Dashboard>;
}

function Dashboard({ title, subtitle, metrics, navigate, children }: { title: string; subtitle: string; metrics: Metric[]; navigate: (path: string) => void; children: ReactNode }) {
  return <section className="page"><Breadcrumb items={['Inicio', title]} /><div className="page-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="stats-grid">{metrics.map((item) => <button key={item.key} className={`metric ${item.tone}`} onClick={() => navigate(item.route)} aria-label={`Abrir detalle de ${item.label}`}><div>{item.icon}<span>{item.label}</span></div><strong>{item.value}</strong><small>Abrir detalle</small></button>)}</div>{children}</section>;
}

function WorkDetailList({ filter, navigate, runtime }: { filter: string | null; navigate: (path: string) => void; runtime: WorkRuntime }) {
  const rows = works.map((work) => withRuntime(work, runtime)).filter((work) => {
    if (filter === 'activos') return ['En desplazamiento', 'En intervención', 'Finalizado técnicamente', 'Pendiente de envío'].includes(work.status);
    if (filter === 'pendientes') return !['Enviado', 'cerrado'].includes(work.status);
    if (filter === 'no-terminados') return work.id === 'TR-2406';
    if (filter === 'info-pendiente') return Boolean(work.pendingInfo);
    return true;
  });
  return <DetailPage title={detailTitle('Trabajos', filter)} summary="Listado filtrado desde indicadores SAT." back="/app/inicio" navigate={navigate}><WorkTable rows={rows} navigate={navigate} /></DetailPage>;
}

function MaterialDetail({ navigate }: { navigate: (path: string) => void }) {
  const rows = works.filter((work) => work.material.includes('pendientes') || work.material.includes('sin confirmar'));
  return <DetailPage title="Material no confirmado" summary="Trabajos con material, proveedor o entrega sin confirmar." back="/app/inicio" navigate={navigate}><div className="table-card"><table><thead><tr><th>Trabajo</th><th>Cliente</th><th>Parte</th><th>Material</th><th>Proveedor</th><th>Entrega</th><th>Impacto</th><th>Técnico</th></tr></thead><tbody>{rows.map((work) => <tr key={work.id} onClick={() => navigate(`/app/trabajos/${work.id}`)}><td>{work.id}</td><td>{clientName(work.clientId)}</td><td>{work.partId}</td><td>{work.material}</td><td>{supplierName(work.supplierId)}</td><td>Sin confirmar</td><td><Badge tone="danger" icon={<AlertTriangle size={14} />}>Puede retrasar</Badge></td><td>{technicianName(work.technicianId)}</td></tr>)}</tbody></table></div></DetailPage>;
}

function BudgetsDetail({ status, navigate }: { status: string | null; navigate: (path: string) => void }) {
  const normalized = status === 'aceptacion-parcial' ? 'aceptación parcial' : status;
  const rows = normalized ? budgets.filter((budget) => budget.status.includes(normalized)) : budgets;
  return <DetailPage title={detailTitle('Presupuestos', status)} summary="Presupuestos con expediente, importe, versión y seguimiento." back="/app/inicio" navigate={navigate}><div className="table-card"><table><thead><tr><th>Código</th><th>Cliente</th><th>Expediente</th><th>Importe</th><th>Versión</th><th>Fecha envío</th><th>Responsable</th><th>Días sin respuesta</th><th>Última acción</th><th>Estado</th></tr></thead><tbody>{rows.map((budget) => <tr key={budget.id}><td>{budget.id}</td><td>{clientName(budget.clientId)}</td><td>{works.find((work) => work.id === budget.sourceWorkId)?.caseId ?? 'EXP-COM-001'}</td><td>{formatCurrency(budget.amount)}</td><td>{budget.version}</td><td>{budget.date}</td><td>{budget.owner}</td><td>{budget.status === 'enviado' ? '4' : '0'}</td><td>Seguimiento comercial</td><td><Badge tone="commercial" icon={<BriefcaseBusiness size={14} />}>{budget.status}</Badge></td></tr>)}</tbody></table></div></DetailPage>;
}

function PrlDetail() {
  return <DetailPage title="PRL próximos" summary="Cursos, reconocimientos y documentos próximos a caducar." back="/app/inicio"><div className="table-card"><table><thead><tr><th>Trabajador</th><th>Curso</th><th>Fecha</th><th>Días</th><th>Clientes afectados</th><th>Centros afectados</th><th>Estado</th><th>Documentos</th></tr></thead><tbody>{technicians.flatMap((tech) => tech.courses).filter((course) => course.days < 40).map((course) => <tr key={course.name}><td>Mara Gil</td><td>{course.name}</td><td>{course.expires}</td><td>{course.days}</td><td>{course.affected}</td><td>Centros logísticos</td><td><Badge tone="warn" icon={<AlertTriangle size={14} />}>Renovar</Badge></td><td>Certificado pendiente</td></tr>)}</tbody></table></div></DetailPage>;
}

function ManagementDetail({ filter, navigate }: { filter: string | null; navigate: (path: string) => void }) {
  return <DetailPage title={filter === 'pendientes' ? 'Trabajos pendientes' : 'Detalle de gerencia'} summary="Distribución por estado, tipo, cliente, carga prevista y desviaciones." back="/app/inicio" navigate={navigate}><div className="grid half"><Card title="Distribución por estado" icon={<PieChart {...iconProps} />}><CompactList items={[[ 'Programados', '5 trabajos · carga prevista 18 h', 'info' ], [ 'Material pendiente', '3 trabajos · desviación probable', 'warn' ], [ 'Críticos', '2 trabajos afectados', 'danger' ]]} /></Card><Card title="Trabajos filtrados" icon={<ClipboardList {...iconProps} />}><div className="work-list">{works.filter((work) => work.status !== 'cerrado').slice(0, 6).map((work) => <WorkRow key={work.id} work={work} onClick={() => navigate(`/app/trabajos/${work.id}`)} />)}</div></Card></div></DetailPage>;
}

function DetailPage({ title, summary, back, navigate, children }: { title: string; summary: string; back: string; navigate?: (path: string) => void; children: ReactNode }) {
  return <section className="page"><Breadcrumb items={['Detalle', title]} /><div className="page-head"><div><h2>{title}</h2><p>{summary}</p></div>{navigate && <button className="link-button" onClick={() => navigate(back)}><ChevronLeft size={16} /> Volver</button>}</div><div className="filters"><label><Search size={16} /><input placeholder="Buscar en resultados..." /></label><select><option>Orden: prioridad</option><option>Orden: fecha</option></select><select><option>Todos los estados</option></select></div>{children}</section>;
}

function OpportunitiesDetail({ navigate }: { navigate: (path: string) => void }) { return <DetailPage title="Oportunidades abiertas" summary="Oportunidades conectadas con trabajos, equipos y deficiencias." back="/app/inicio" navigate={navigate}><CompactList items={works.filter((work) => work.budgetId).map((work) => [clientName(work.clientId), `${work.equipmentId} · ${work.fault} · ${work.budgetId}`, work.priority])} /></DetailPage>; }
function ContractsDetail() { return <DetailPage title="Contratos" summary="Renovaciones y contratos de mantenimiento." back="/app/inicio"><CompactList items={contracts.map((contract) => [clientName(contract.clientId), `${contract.renewal} · ${contract.equipment} equipos · ${contract.status}`, contract.status === 'vigente' ? 'ok' : 'warn'])} /></DetailPage>; }
function InvoicesDetail({ filter }: { filter: string | null }) { return <DetailPage title={filter === 'vencidos' ? 'Cobros vencidos' : 'Facturación'} summary="Facturas, vencimientos e importes simulados." back="/app/inicio"><CompactList items={invoices.map((invoice) => [invoice.id, `${clientName(invoice.clientId)} · ${invoice.due} · ${formatCurrency(invoice.amount)} · ${invoice.status}`, invoice.status === 'vencida' ? 'danger' : 'warn'])} /></DetailPage>; }
function PurchasesDetail() { return <DetailPage title="Compras y proveedores" summary="Pedidos, confirmaciones y expedientes afectados." back="/app/inicio"><CompactList items={purchases.map((purchase) => [purchase.id, `${supplierName(purchase.supplierId)} · ${purchase.date} · ${purchase.confirmation} · afecta ${purchase.affected}`, purchase.confirmation === 'confirmado' ? 'ok' : 'warn'])} /></DetailPage>; }
function VehiclesDetail() { return <DetailPage title="Vehículos" summary="ITV, seguros y mantenimiento de flota ficticia." back="/app/inicio"><CompactList items={[[ 'FIC-2045', 'ITV 12/07 · seguro vigente · mantenimiento menor', 'warn' ], [ 'FIC-9812', 'Seguro 21/08 · mantenimiento programado', 'info' ]]} /></DetailPage>; }
function GenericAlertsPage({ workspace, navigate }: { workspace: ProfileId; navigate: (path: string) => void }) { return <DetailPage title="Avisos" summary="Centro de avisos filtrado por perfil." back="/app/inicio" navigate={navigate}><AlertsPanel items={alerts.filter((alert) => alert.profiles.includes(workspace))} navigate={navigate} /></DetailPage>; }

function TechnicianApp({ user, path, navigate, runtime, setRuntime, checks, setChecks, onLogout }: { user: DemoUser; path: string; navigate: (path: string) => void; runtime: WorkRuntime; setRuntime: (runtime: WorkRuntime) => void; checks: CheckRecord[]; setChecks: (checks: CheckRecord[]) => void; onLogout: () => void }) {
  const [alertsOpen, setAlertsOpen] = useState(false);
  const route = cleanPath(path);
  const workId = route.match(/\/app\/tecnico\/trabajo\/([^/]+)/)?.[1];
  const checkMatch = route.match(/\/app\/tecnico\/trabajo\/([^/]+)\/check(?:\/([^/]+))?/);
  if (checkMatch) {
    const work = works.find((item) => item.id === checkMatch[1]) ?? works[0];
    return <TechShell user={user} onLogout={onLogout} onAlerts={() => setAlertsOpen(true)}>{checkMatch[2] ? <SectionalCheckBlock work={work} blockId={checkMatch[2] as CheckBlockId} checks={checks} setChecks={setChecks} navigate={navigate} user={user} /> : <SectionalCheckMain work={work} checks={checks} setChecks={setChecks} navigate={navigate} user={user} />}{alertsOpen && <BottomSheet onClose={() => setAlertsOpen(false)}><AlertsPanel items={alerts.filter((alert) => alert.profiles.includes('tecnico'))} navigate={navigate} /></BottomSheet>}</TechShell>;
  }
  if (workId) {
    const work = works.find((item) => item.id === workId) ?? works[0];
    return <TechShell user={user} onLogout={onLogout} onAlerts={() => setAlertsOpen(true)}><TechnicianWorkDetail work={work} runtime={runtime} setRuntime={setRuntime} checks={checks} navigate={navigate} user={user} />{alertsOpen && <BottomSheet onClose={() => setAlertsOpen(false)}><AlertsPanel items={alerts.filter((alert) => alert.profiles.includes('tecnico'))} navigate={navigate} /></BottomSheet>}</TechShell>;
  }
  return <TechShell user={user} onLogout={onLogout} onAlerts={() => setAlertsOpen(true)}><MyDay runtime={runtime} navigate={navigate} />{alertsOpen && <BottomSheet onClose={() => setAlertsOpen(false)}><AlertsPanel items={alerts.filter((alert) => alert.profiles.includes('tecnico'))} navigate={navigate} /></BottomSheet>}</TechShell>;
}

function MyDay({ runtime, navigate }: { runtime: WorkRuntime; navigate: (path: string) => void }) {
  const [tab, setTab] = useState<'pending' | 'active' | 'done'>('pending');
  const dayWorks = works.filter((work) => ['TR-2401', 'TR-2406', 'TR-2411'].includes(work.id)).map((work) => withRuntime(work, runtime));
  const rows = dayWorks.filter((work) => {
    const stage = runtime[work.id]?.stage ?? 'downloaded';
    if (tab === 'pending') return ['downloaded'].includes(stage);
    if (tab === 'active') return ['traveling', 'working', 'review', 'readyToSend'].includes(stage);
    return stage === 'sent';
  });
  return <section className="page"><div className="page-head"><div><p className="eyebrow">Trabajo técnico</p><h2>Mi jornada</h2><p>Partes asignados para hoy. Solo puede haber un trabajo activo al mismo tiempo.</p></div></div><div className="tabs"><button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>Pendientes</button><button className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>En curso</button><button className={tab === 'done' ? 'active' : ''} onClick={() => setTab('done')}>Finalizados</button></div><div className="work-list">{rows.map((work) => <button className="journey-card" key={work.id} onClick={() => navigate(`/app/tecnico/trabajo/${work.id}`)}><div><strong>{work.hour} · {work.type}</strong><span>{clientName(work.clientId)} · {centerName(work.centerId)}</span><span>{work.equipmentId} · {equipmentName(work.equipmentId)}</span><p>{work.fault}</p></div><div><Badge tone={work.priority} icon={iconForTone(work.priority)}>{work.priority}</Badge><Badge tone={toneForStatus(work.status)} icon={iconForTone(toneForStatus(work.status))}>{work.status}</Badge><small>Material: {work.material}</small><small>Acceso: {work.access}</small><b>Abrir trabajo</b></div></button>)}{rows.length === 0 && <Card title="Sin partes en esta pestaña" icon={<CheckCircle2 {...iconProps} />}><p className="large-note">No hay trabajos en este estado.</p></Card>}</div></section>;
}

function TechnicianWorkDetail({ work, runtime, setRuntime, checks, navigate, user }: { work: Work; runtime: WorkRuntime; setRuntime: (runtime: WorkRuntime) => void; checks: CheckRecord[]; navigate: (path: string) => void; user: DemoUser }) {
  const [message, setMessage] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const state = runtime[work.id] ?? { stage: 'downloaded' as TechnicianStage, history: [`${now()} Trabajo descargado`] };
  const previous = previousStage(state.stage);
  const workChecks = checks.filter((check) => check.workId === work.id && check.completed);
  const pendingChecks = work.equipmentId === 'EQ-SEC-001' && !workChecks.length ? [['Check seccional industrial', 'Puerta seccional industrial · pendiente para este parte', 'warn'] as const] : [];
  const update = (next: typeof state) => setRuntime({ ...runtime, [work.id]: next });
  const advance = () => {
    if (state.stage === 'sent') { requestReturn(); return; }
    if (state.stage === 'downloaded' && Object.entries(runtime).some(([id, item]) => id !== work.id && ['traveling', 'working', 'review', 'readyToSend'].includes(item.stage))) { setMessage('Ya existe otro trabajo activo. Finalízalo o corrige su estado antes de iniciar este.'); return; }
    const next = nextStage(state.stage);
    update({ ...state, stage: next, history: [...state.history, `${now()} Estado cambiado a “${stageLabel(next)}”`] });
    setMessage(`Estado actualizado: ${stageLabel(next)}`);
  };
  const goBack = () => {
    if (!previous) return;
    if (window.confirm(`¿Volver a “${stageLabel(previous)}”? Se conservará el historial.`)) {
      update({ ...state, stage: previous, history: [...state.history, `${now()} Corrección manual por ${user.name}: vuelve a “${stageLabel(previous)}”`] });
      setMessage('Estado corregido sin borrar el cambio anterior.');
    }
  };
  const requestReturn = () => {
    if (state.returnRequested) { setMessage('La devolución a SAT ya está solicitada.'); return; }
    update({ ...state, returnRequested: true, history: [...state.history, `${now()} Devolución solicitada a SAT por ${user.name}`] });
    setMessage('Devolución solicitada a SAT.');
  };
  return <section className="page"><button className="link-button" onClick={() => navigate('/app/tecnico')}><ChevronLeft size={16} /> Mi jornada</button><section className="tech-hero"><Badge tone={toneForStage(state.stage)} icon={iconForTone(toneForStage(state.stage))}>{stageLabel(state.stage)}</Badge><h1>{work.type}</h1><p>{clientName(work.clientId)} · {centerName(work.centerId)}</p><strong>{work.address}</strong><button className="primary wide big" onClick={advance}>{state.stage === 'sent' ? 'Solicitar devolución a SAT' : primaryTechnicianAction(state.stage)}</button>{previous && state.stage !== 'sent' && <button className="state-back" onClick={goBack}>Estado actual: {stageLabel(state.stage)} · Volver a {stageLabel(previous)}</button>}{message && <p className="success-note">{message}</p>}</section><Card title="Datos del parte" icon={<FileText {...iconProps} />}><InfoGrid items={[[ 'Cliente', clientName(work.clientId) ], [ 'Contacto', work.contact ], [ 'Equipo', `${work.equipmentId} · ${equipmentName(work.equipmentId)}` ], [ 'Ubicación', work.address ], [ 'Avería', work.fault ], [ 'Acceso', work.access ], [ 'Antecedentes', 'Holgura leve y térmico disparado en intervención anterior' ], [ 'Material previsto', work.material ]]} /></Card><Card title="Documentación técnica" icon={<FileText {...iconProps} />}><TechnicalDocs equipmentId={work.equipmentId} /></Card><div className="tech-sections"><Card title="Diagnóstico" icon={<Wrench {...iconProps} />}><textarea disabled={state.stage === 'sent'} placeholder="Registrar diagnóstico técnico..." /></Card><Card title="Trabajo realizado" icon={<ClipboardCheck {...iconProps} />}><textarea disabled={state.stage === 'sent'} placeholder="Describir actuación realizada..." /></Card><Card title="Fotografías" icon={<Factory {...iconProps} />}><div className="photo-strip"><span>Cámara simulada</span><span>Galería simulada</span><button disabled={state.stage === 'sent'}>Añadir archivos</button></div></Card><Card title="Checks" icon={<ClipboardList {...iconProps} />}><div className="tabs"><button className="active">Por realizar</button><button>Realizados</button></div><CompactList items={pendingChecks.length ? pendingChecks : [[ 'Sin checks pendientes', 'Los checks de este parte están completados', 'ok' ]]} />{pendingChecks.length > 0 && <button className="primary wide" onClick={() => navigate(`/app/tecnico/trabajo/${work.id}/check`)}>Abrir check</button>}<CompactList items={workChecks.map((check) => [check.id, `${check.date} · ${check.technician} · ${check.result}`, check.result.includes('No favorable') ? 'danger' : 'ok'])} /></Card><Card title="Documentación, deficiencias y firma" icon={<ShieldAlert {...iconProps} />}><InfoGrid items={[[ 'Documentación', 'Manuales y esquemas disponibles arriba' ], [ 'Deficiencias', 'Pendiente de registrar si aplica' ], [ 'Firma', state.stage === 'sent' ? 'Parte enviado' : 'Pendiente de recoger' ]]} /></Card><Card title="Historial de estados" icon={<CalendarClock {...iconProps} />}><Timeline items={state.history} /></Card></div><nav className="tech-bottom"><button className="active"><ClipboardList size={18} />Trabajo</button><button onClick={() => setMoreOpen(true)}><MoreHorizontal size={18} />Más acciones</button></nav>{moreOpen && <BottomSheet onClose={() => setMoreOpen(false)}><button>Voy a terminar antes</button><button>Consultar antecedentes</button><button>Añadir fotografía</button><button>Registrar material</button><button>Comunicar incidencia</button><button>Registrar deficiencia</button><button>Abrir ubicación</button><button>Llamar al contacto</button><button>Requisitos de acceso</button></BottomSheet>}</section>;
}

function SectionalCheckMain({ work, checks, setChecks, navigate, user }: { work: Work; checks: CheckRecord[]; setChecks: (checks: CheckRecord[]) => void; navigate: (path: string) => void; user: DemoUser }) {
  const done = checks.find((check) => check.workId === work.id);
  const blocks = done?.blocks ?? emptyBlocks();
  const reviewed = Object.values(blocks).filter((status) => status !== 'Sin revisar').length;
  const finish = () => {
    if (reviewed < 6) return;
    const record: CheckRecord = { id: done?.id ?? `CHK-${work.partId}`, workId: work.id, partId: work.partId, equipmentId: work.equipmentId, technician: user.name, date: new Date().toLocaleString('es-ES'), result: Object.values(blocks).some((item) => item === 'No favorable') ? 'No favorable' : 'Favorable', blocks, completed: true };
    setChecks(done ? checks.map((item) => item.id === done.id ? record : item) : [...checks, record]);
    navigate(`/app/tecnico/trabajo/${work.id}`);
  };
  return <section className="check-mobile"><button className="link-button" onClick={() => navigate(`/app/tecnico/trabajo/${work.id}`)}><ChevronLeft size={16} /> Volver al parte</button><header><p className="eyebrow">Check seccional industrial</p><h2>{work.partId} · {work.equipmentId}</h2><p>{reviewed} de 6 bloques revisados</p></header><div className="progress"><span style={{ width: `${(reviewed / 6) * 100}%` }} /></div><div className="door-check" aria-label="Zonas táctiles de puerta seccional"><img src="/checks/seccional-industrial.png" alt="Puerta seccional industrial" />{physicalSectionalBlocks.map((block) => <button key={block.id} style={block.area} className={`hotspot ${statusTone(blocks[block.id])}`} onClick={() => navigate(`/app/tecnico/trabajo/${work.id}/check/${block.id}`)} aria-label={`Revisar ${block.name}`}><span>{block.name}</span></button>)}</div><div className="block-list">{sectionalBlocks.map((block) => <button key={block.id} onClick={() => navigate(`/app/tecnico/trabajo/${work.id}/check/${block.id}`)}><span>{block.name}</span><Badge tone={statusTone(blocks[block.id])} icon={iconForTone(statusTone(blocks[block.id]))}>{blocks[block.id]}</Badge></button>)}</div><button className="primary wide big" disabled={reviewed < 6} onClick={finish}>Finalizar check</button>{reviewed < 6 && <p className="large-note">Para finalizar, todos los bloques deben estar revisados o marcados como No aplicable.</p>}{done?.completed && <Card title="Resumen" icon={<CheckCircle2 {...iconProps} />}><p className="large-note">Check completado y asociado al parte {work.partId}, equipo {work.equipmentId} y técnico {done.technician}.</p></Card>}</section>;
}

function SectionalCheckBlock({ work, blockId, checks, setChecks, navigate, user }: { work: Work; blockId: CheckBlockId; checks: CheckRecord[]; setChecks: (checks: CheckRecord[]) => void; navigate: (path: string) => void; user: DemoUser }) {
  const block = sectionalBlocks.find((item) => item.id === blockId) ?? sectionalBlocks[0];
  const existing = checks.find((check) => check.workId === work.id);
  const [status, setStatus] = useState<CheckStatus>(existing?.blocks[blockId] ?? 'Sin revisar');
  const [components, setComponents] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const back = () => {
    if (!dirty) { navigate(`/app/tecnico/trabajo/${work.id}/check`); return; }
    const choice = window.confirm('Hay cambios sin guardar. Aceptar para guardar y volver, cancelar para seguir editando.');
    if (choice) save();
  };
  const save = () => {
    const blocks = { ...(existing?.blocks ?? emptyBlocks()), [blockId]: status };
    const record: CheckRecord = { id: existing?.id ?? `CHK-${work.partId}`, workId: work.id, partId: work.partId, equipmentId: work.equipmentId, technician: user.name, date: new Date().toLocaleString('es-ES'), result: existing?.completed ? existing.result : 'Borrador', blocks, completed: existing?.completed };
    setChecks(existing ? checks.map((item) => item.id === existing.id ? record : item) : [...checks, record]);
    navigate(`/app/tecnico/trabajo/${work.id}/check`);
  };
  const favorableAll = () => { setStatus('Favorable'); setComponents(block.components); setDirty(true); };
  return <section className="check-mobile"><button className="link-button sticky-back" onClick={back}><ChevronLeft size={16} /> Volver a la puerta</button><header><p className="eyebrow">Detalle del bloque</p><h2>{block.name}</h2><Badge tone={statusTone(status)} icon={iconForTone(statusTone(status))}>{status}</Badge></header><button className="primary wide" onClick={favorableAll}>Favorable a todo</button><div className="status-grid">{checkStatuses.map((item) => <button key={item} className={status === item ? 'active' : ''} onClick={() => { setStatus(item); setDirty(true); }}>{item}</button>)}</div>{!['Favorable', 'Sin revisar', 'No aplicable'].includes(status) && <Card title="Componentes afectados" icon={<Wrench {...iconProps} />}><div className="component-select">{block.components.map((component) => <label key={component}><input type="checkbox" checked={components.includes(component)} onChange={(event) => { setDirty(true); setComponents(event.target.checked ? [...components, component] : components.filter((item) => item !== component)); }} /> {component}</label>)}</div></Card>}<Card title="Observaciones" icon={<FileText {...iconProps} />}><textarea onChange={() => setDirty(true)} placeholder="Observaciones del bloque..." /></Card><Card title="Descripción de intervención" icon={<ClipboardCheck {...iconProps} />}><textarea onChange={() => setDirty(true)} placeholder="Intervención realizada si aplica..." /></Card><Card title="Fotografías" icon={<Factory {...iconProps} />}><div className="photo-strip"><button onClick={() => { setPhotos([...photos, `Foto ${photos.length + 1}`]); setDirty(true); }}>Cámara</button><button onClick={() => { setPhotos([...photos, `Galería ${photos.length + 1}`]); setDirty(true); }}>Galería</button><button onClick={() => { setPhotos([...photos, `Archivo ${photos.length + 1}`]); setDirty(true); }}>Archivos</button></div><div className="photo-list">{photos.map((photo) => <span key={photo}>{photo}<button onClick={() => setPhotos(photos.filter((item) => item !== photo))}>Eliminar</button></span>)}</div></Card><button className="primary wide big" onClick={save}>Guardar bloque</button></section>;
}

function TechShell({ user, onLogout, onAlerts, children }: { user: DemoUser; onLogout: () => void; onAlerts: () => void; children: ReactNode }) { return <div className="tech-app"><header className="tech-top"><div><strong>DoorManager Técnico</strong><small>{user.name} · {user.position}</small></div><button onClick={onAlerts} title="Avisos"><Bell size={18} /></button><button onClick={onLogout} title="Cerrar sesión"><LogOut size={18} /></button></header><main className="tech-main">{children}</main></div>; }

function useTechStage(): [TechnicianStage, (stage: TechnicianStage) => void] { const [stage, setState] = useState<TechnicianStage>(() => (localStorage.getItem(techStageKey) as TechnicianStage | null) ?? 'downloaded'); const setStage = (next: TechnicianStage) => { localStorage.setItem(techStageKey, next); setState(next); }; return [stage, setStage]; }
function useTechHistory(): [string[], (items: string[]) => void] { const [history, setState] = useState<string[]>(() => JSON.parse(localStorage.getItem(techHistoryKey) ?? 'null') as string[] | null ?? [`${now()} Trabajo descargado`]); const setHistory = (items: string[]) => { localStorage.setItem(techHistoryKey, JSON.stringify(items)); setState(items); }; return [history, setHistory]; }

function navForWorkspace(workspace: ProfileId): NavItem[] {
  const map: Record<ProfileId, NavItem[]> = {
    sat: [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'planificacion', label: 'Planificación', path: '/app/planificacion', icon: Gauge }, { id: 'trabajos', label: 'Trabajos', path: '/app/trabajos', icon: ClipboardList }, { id: 'tecnicos', label: 'Técnicos', path: '/app/tecnicos', icon: UsersRound }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'equipos', label: 'Equipos', path: '/app/equipos', icon: Factory }, { id: 'expedientes', label: 'Expedientes', path: '/app/expedientes', icon: FileText }, { id: 'partes', label: 'Partes', path: '/app/partes', icon: ClipboardCheck }, { id: 'material', label: 'Material', path: '/app/material', icon: Warehouse }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }],
    comercial: [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'oportunidades', label: 'Oportunidades', path: '/app/oportunidades', icon: TrendingUp }, { id: 'presupuestos', label: 'Presupuestos', path: '/app/presupuestos', icon: DollarSign }, { id: 'contratos', label: 'Contratos', path: '/app/contratos', icon: FileText }, { id: 'visitas', label: 'Visitas', path: '/app/visitas', icon: CalendarClock }, { id: 'expedientes', label: 'Expedientes', path: '/app/expedientes', icon: ClipboardList }, { id: 'informes', label: 'Informes comerciales', path: '/app/informes-comerciales', icon: PieChart }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }],
    oficina: [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'admin', label: 'Administración', path: '/app/administracion', icon: ClipboardCheck }, { id: 'facturacion', label: 'Facturación', path: '/app/facturacion', icon: DollarSign }, { id: 'cobros', label: 'Cobros', path: '/app/cobros', icon: CheckCircle2 }, { id: 'compras', label: 'Compras', path: '/app/compras', icon: Truck }, { id: 'proveedores', label: 'Proveedores', path: '/app/proveedores', icon: Warehouse }, { id: 'prl', label: 'PRL y personal', path: '/app/prl', icon: ShieldAlert }, { id: 'vehiculos', label: 'Vehículos', path: '/app/vehiculos', icon: Car }, { id: 'documentos', label: 'Documentos', path: '/app/documentos', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }],
    gerencia: [{ id: 'inicio', label: 'Inicio', path: '/app/inicio', icon: Home }, { id: 'resumen', label: 'Resumen', path: '/app/resumen', icon: PieChart }, { id: 'ventas', label: 'Ventas', path: '/app/ventas', icon: TrendingUp }, { id: 'operaciones', label: 'Operaciones', path: '/app/operaciones', icon: Gauge }, { id: 'rentabilidad', label: 'Rentabilidad', path: '/app/rentabilidad', icon: DollarSign }, { id: 'calidad', label: 'Calidad', path: '/app/calidad', icon: ShieldAlert }, { id: 'clientes', label: 'Clientes', path: '/app/clientes', icon: Building2 }, { id: 'personal', label: 'Personal', path: '/app/personal', icon: UsersRound }, { id: 'informes', label: 'Informes', path: '/app/informes', icon: FileText }, { id: 'avisos', label: 'Avisos', path: '/app/avisos', icon: Bell }],
    tecnico: [],
  };
  return map[workspace];
}

function defaultRoute(workspace: ProfileId) { return workspace === 'tecnico' ? '/app/tecnico' : '/app/inicio'; }
function activeNav(nav: NavItem[], path: string) { const exact = nav.find((item) => item.path === path); if (exact) return exact; return nav.filter((item) => path.startsWith(`${item.path}/`)).sort((a, b) => b.path.length - a.path.length)[0] ?? nav.find((item) => item.id === 'inicio'); }
function cleanPath(path: string) { return path.split('?')[0]; }
function kpi(key: string, label: string, value: string, tone: Severity, icon: ReactNode, route: string): Metric { return { key, label, value, tone, icon, route }; }
function detailTitle(base: string, filter: string | null) { return filter ? `${base}: ${filter.replaceAll('-', ' ')}` : base; }

function GlobalSearch({ workspace, query, setQuery, navigate }: { workspace: ProfileId; query: string; setQuery: (value: string) => void; navigate: (path: string) => void }) { const results = useMemo(() => buildSearchResults(workspace, query), [workspace, query]); return <div className="search-wrap"><label className="search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, equipo, expediente, parte..." /></label>{query && <div className="search-results">{results.length ? results.map((item) => <button key={`${item.kind}-${item.id}`} onClick={() => { setQuery(''); navigate(item.route); }}><Badge tone={item.tone} icon={iconForTone(item.tone)}>{item.kind}</Badge><span>{item.title}</span><small>{item.detail}</small></button>) : <p>Sin resultados visibles para este perfil.</p>}</div>}</div>; }
function buildSearchResults(workspace: ProfileId, query: string) { if (!query.trim()) return []; const term = query.toLowerCase(); const rows: { kind: string; id: string; title: string; detail: string; tone: Severity; route: string }[] = []; works.forEach((work) => { const text = `${work.id} ${work.caseId} ${work.partId} ${clientName(work.clientId)} ${centerName(work.centerId)} ${work.equipmentId}`.toLowerCase(); if (text.includes(term)) rows.push({ kind: 'Trabajo', id: work.id, title: work.id, detail: `${clientName(work.clientId)} · ${work.status}`, tone: toneForStatus(work.status), route: workspace === 'tecnico' ? '/app/tecnico' : '/app/trabajos/' + work.id }); }); if (workspace !== 'tecnico') equipment.forEach((item) => { const text = `${item.id} ${item.type} ${clientName(item.clientId)}`.toLowerCase(); if (text.includes(term)) rows.push({ kind: 'Equipo', id: item.id, title: item.id, detail: `${item.type} · ${clientName(item.clientId)}`, tone: toneForEquipment(item.status), route: '/app/equipos/' + item.id }); }); return rows.slice(0, 8); }

function AlertsPanel({ items, navigate }: { items: AlertItem[]; navigate: (path: string) => void }) { const [read, setRead] = useState<string[]>([]); const [filter, setFilter] = useState<Severity | 'all'>('all'); const filtered = items.filter((item) => filter === 'all' || item.severity === filter); return <div className="alerts-panel"><div className="tabs"><button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button><button className={filter === 'danger' ? 'active' : ''} onClick={() => setFilter('danger')}>Críticos</button><button className={filter === 'warn' ? 'active' : ''} onClick={() => setFilter('warn')}>Riesgo</button></div><div className="compact-list">{filtered.map((item) => <article key={item.id} className={read.includes(item.id) ? 'read' : ''}><Badge tone={item.severity} icon={iconForTone(item.severity)}>{item.title}</Badge><p>{item.detail}<br /><small>{item.date} · {item.entity} · {item.status}</small></p><div className="row-actions"><button onClick={() => item.route && navigate(toAppRoute(item.route))}>Abrir</button><button onClick={() => setRead([...read, item.id])}>Leído</button></div></article>)}</div></div>; }
function toAppRoute(route: string) { return route.replace('/demo/sat/trabajos', '/app/trabajos').replace('/demo/sat/equipos', '/app/equipos'); }

function WorkTable({ rows, navigate }: { rows: Work[]; navigate: (path: string) => void }) { return <div className="table-card"><table><thead><tr><th>Trabajo</th><th>Cliente / centro</th><th>Equipo</th><th>Hora</th><th>Técnico</th><th>Material</th><th>Acceso</th><th>Estado</th></tr></thead><tbody>{rows.map((work) => <tr key={work.id} onClick={() => navigate(`/app/trabajos/${work.id}`)}><td><strong>{work.id}</strong><span>{work.type}</span></td><td><strong>{clientName(work.clientId)}</strong><span>{centerName(work.centerId)}</span></td><td>{work.equipmentId}</td><td>{work.hour}</td><td>{technicianName(work.technicianId)}</td><td>{work.material}</td><td>{work.access}</td><td><Badge tone={toneForStatus(work.status)} icon={iconForTone(toneForStatus(work.status))}>{work.status}</Badge></td></tr>)}</tbody></table></div>; }
function WorkRow({ work, onClick }: { work: Work; onClick: () => void }) { return <button className="work-row" onClick={onClick}><div><strong>{work.hour} · {work.type}</strong><span>{clientName(work.clientId)} · {centerName(work.centerId)}</span><span>{work.equipmentId} · {technicianName(work.technicianId)}</span></div><div><Badge tone={work.priority} icon={iconForTone(work.priority)}>{work.priority}</Badge><Badge tone={toneForStatus(work.status)} icon={iconForTone(toneForStatus(work.status))}>{work.status}</Badge></div></button>; }
function EquipmentList({ navigate }: { navigate: (path: string) => void }) { return <DetailPage title="Equipos" summary="Fichas de equipos compartidas por departamentos." back="/app/inicio" navigate={navigate}><div className="grid half">{equipment.map((item) => <Card key={item.id} title={item.id} icon={<Factory {...iconProps} />} action={<button onClick={() => navigate(`/app/equipos/${item.id}`)}>Abrir</button>}><InfoGrid items={[[ 'Cliente', clientName(item.clientId) ], [ 'Centro', centerName(item.centerId) ], [ 'Tipo', item.type ], [ 'Estado', item.status ], [ 'Próxima revisión', item.next ]]} /></Card>)}</div></DetailPage>; }
function TechniciansPage() { return <DetailPage title="Técnicos" summary="Disponibilidad, cualificaciones y avisos no bloqueantes." back="/app/inicio"><div className="grid half">{technicians.map((tech) => <TechnicianCard key={tech.id} tech={tech} />)}</div></DetailPage>; }
function TechnicianCard({ tech }: { tech: typeof technicians[number] }) { return <article className="tech-card"><div><strong>{tech.name}</strong><Badge tone={tech.availability.includes('Disponible') ? 'ok' : 'info'} icon={<UserRound size={14} />}>{tech.availability}</Badge></div><p>{tech.currentWorkId ?? 'Sin trabajo activo'} · fin {tech.eta}</p><span>Habilitación: {tech.enabledFor}</span><small>{tech.courses.map((course) => `${course.name} ${course.expires}`).join(' · ')}</small>{tech.warning && <Badge tone="warn" icon={<AlertTriangle size={14} />}>{tech.warning}</Badge>}</article>; }
function JobDetail({ work, navigate, checks }: { work: Work; navigate: (path: string) => void; checks: CheckRecord[] }) { const workChecks = checks.filter((check) => check.workId === work.id && check.completed); return <section className="page"><Breadcrumb items={['Trabajos', work.id]} /><div className="detail-hero"><div><p className="eyebrow">Ficha de trabajo</p><h2>{work.type} · {work.id}</h2><p>{clientName(work.clientId)} · {centerName(work.centerId)} · {work.equipmentId}</p></div><Badge tone={work.priority} icon={iconForTone(work.priority)}>{work.status}</Badge></div><div className="actions"><button>Editar planificación</button><button>Abrir cliente</button><button onClick={() => navigate(`/app/equipos/${work.equipmentId}`)}>Abrir equipo</button><button>Revisar material</button><button>Validar parte</button></div><div className="grid two-one"><Card title="Datos principales" icon={<FileText {...iconProps} />}><InfoGrid items={[[ 'Expediente', work.caseId ], [ 'Parte', work.partId ], [ 'Cliente', clientName(work.clientId) ], [ 'Centro', centerName(work.centerId) ], [ 'Contacto', work.contact ], [ 'Dirección', work.address ], [ 'Equipo', work.equipmentId ], [ 'Técnico', technicianName(work.technicianId) ]]} /></Card><Card title="Recursos y pendientes" icon={<PackageCheck {...iconProps} />}><InfoGrid items={[[ 'Material previsto', work.material ], [ 'Proveedor', supplierName(work.supplierId) ], [ 'Acceso', work.access ], [ 'Información pendiente', work.pendingInfo ?? 'Sin bloqueos administrativos' ]]} /></Card></div><Card title="Documentación técnica" icon={<FileText {...iconProps} />}><TechnicalDocs equipmentId={work.equipmentId} /></Card><Card title="Checks realizados en este parte" icon={<ClipboardCheck {...iconProps} />}><CompactList items={workChecks.length ? workChecks.map((check) => [check.id, `${check.date} · ${check.technician} · ${check.result}`, check.result.includes('No favorable') ? 'danger' : 'ok']) : [[ 'Sin checks', 'Aún no hay checks completados en esta intervención', 'muted' ]]} /></Card><button className="link-button" onClick={() => navigate('/app/trabajos')}><ChevronLeft size={16} /> Volver</button></section>; }
function EquipmentDetail({ item, navigate, checks }: { item: typeof equipment[number]; navigate: (path: string) => void; checks: CheckRecord[] }) { return <section className="page"><Breadcrumb items={['Equipos', item.id]} /><div className="detail-hero"><div><p className="eyebrow">Ficha de equipo</p><h2>{item.id} · {item.type}</h2><p>{clientName(item.clientId)} · {centerName(item.centerId)} · {item.location}</p></div><Badge tone={toneForEquipment(item.status)} icon={<Factory size={15} />}>{item.status}</Badge></div><div className="actions"><button className="primary" onClick={() => navigate('/app/tecnico/check')}>Abrir check provisional</button><button>Abrir cliente</button><button>Abrir expediente</button></div><Card title="Identificación" icon={<Factory {...iconProps} />}><InfoGrid items={[[ 'Código', item.id ], [ 'Cliente', clientName(item.clientId) ], [ 'Centro', centerName(item.centerId) ], [ 'Ubicación', item.location ], [ 'Fabricante', item.maker ], [ 'Modelo', item.model ], [ 'Serie', item.serial ], [ 'Última intervención', item.last ], [ 'Próxima revisión', item.next ]]} /></Card><Card title="Documentación técnica" icon={<FileText {...iconProps} />}><TechnicalDocs equipmentId={item.id} /></Card><Card title="Checks del equipo" icon={<ClipboardCheck {...iconProps} />}><CompactList items={checks.filter((check) => check.equipmentId === item.id).map((check) => [check.partId, `${check.date} · ${check.technician} · ${check.result}`, 'ok'])} /></Card></section>; }

function Card({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) { return <section className="card"><header><h3>{icon}{title}</h3>{action}</header>{children}</section>; }
function CompactList({ items }: { items: (readonly [string, string, string])[] }) { return <div className="compact-list">{items.map(([title, text, tone]) => <article key={`${title}-${text}`}><Badge tone={tone as Severity} icon={iconForTone(tone as Severity)}>{title}</Badge><p>{text}</p></article>)}</div>; }
function InfoGrid({ items }: { items: [string, string][] }) { return <dl className="info-grid">{items.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>; }
function Timeline({ items }: { items: string[] }) { return <ol className="timeline">{items.map((item) => <li key={item}>{item}</li>)}</ol>; }
function Breadcrumb({ items }: { items: string[] }) { return <div className="breadcrumb">{items.map((item, index) => <span key={`${item}-${index}`}>{index > 0 && '/'} {item}</span>)}</div>; }
function Badge({ tone, icon, children }: { tone: Severity; icon: ReactNode; children: ReactNode }) { return <span className={`badge ${tone}`}>{icon}{children}</span>; }
function SidePanel({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) { useEscape(onClose); return <div className="overlay" role="dialog" aria-modal="true"><aside className="side-panel"><header><div><p className="eyebrow">{subtitle}</p><h2>{title}</h2></div><button onClick={onClose} aria-label="Cerrar"><X size={18} /></button></header>{children}</aside></div>; }
function BottomSheet({ onClose, children }: { onClose: () => void; children: ReactNode }) { useEscape(onClose); return <div className="sheet-backdrop" role="dialog" aria-modal="true"><div className="bottom-sheet"><button className="sheet-close" onClick={onClose}>Cerrar</button>{children}</div></div>; }
function VisualCheckPlaceholder({ navigate }: { navigate: (path: string) => void }) { return <section className="page"><Breadcrumb items={['Técnico', 'Check provisional']} /><Card title="Prototipo técnico en desarrollo" icon={<ClipboardCheck {...iconProps} />}><p className="large-note">Esta pantalla conserva el acceso provisional. No representa el sistema definitivo de checks técnicos.</p><div className="component-photo"><Wrench size={42} /><span>Esquema provisional sustituible</span></div><button className="primary" onClick={() => navigate('/app/tecnico')}>Volver al trabajo</button></Card></section>; }

function TechnicalDocs({ equipmentId }: { equipmentId: string }) {
  const prioritized = [...technicalDocs].sort((a, b) => Number(b[2].includes(equipmentId)) - Number(a[2].includes(equipmentId)));
  return <div className="doc-list">{prioritized.map(([title, type, scope]) => <article key={title}><FileText size={17} /><div><strong>{title}</strong><span>{type} · {scope}</span></div></article>)}</div>;
}

function BarChart({ values, labels, tone }: { values: number[]; labels: string[]; tone: Severity }) { const max = Math.max(...values); return <div className="bar-chart">{values.map((value, index) => <div key={labels[index]}><span style={{ height: `${(value / max) * 100}%` }} className={tone}></span><small>{labels[index]}</small><b>{value}</b></div>)}</div>; }
function DualBars({ left, right, leftValue, rightValue }: { left: string; right: string; leftValue: number; rightValue: number }) { return <div className="dual-bars"><label>{left}<span><i style={{ width: `${leftValue}%` }} /></span><b>{leftValue}</b></label><label>{right}<span><i style={{ width: `${rightValue}%` }} /></span><b>{rightValue}</b></label></div>; }
function useEscape(action: () => void) { useEffect(() => { const listener = (event: KeyboardEvent) => { if (event.key === 'Escape') action(); }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, [action]); }

function logout(setSession: (session: Session | null) => void, navigate: (path: string) => void) { setSession(null); navigate('/'); }
function resetDemo(setSession: (session: Session | null) => void, navigate: (path: string) => void) { localStorage.removeItem(techStageKey); localStorage.removeItem(techHistoryKey); localStorage.removeItem(workRuntimeKey); localStorage.removeItem(checksKey); localStorage.removeItem(sidebarKey); setSession(null); navigate('/'); }
function now() { return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
function previousStageFromHistory(history: string[]): TechnicianStage | null { const stages: TechnicianStage[] = ['downloaded', 'traveling', 'working', 'review', 'readyToSend', 'sent']; const currentIndex = Math.max(0, history.filter((item) => item.includes('Estado cambiado')).length - 1); return stages[currentIndex] ?? null; }
function previousStage(stage: TechnicianStage): TechnicianStage | null { const order: TechnicianStage[] = ['downloaded', 'traveling', 'working', 'review', 'readyToSend', 'sent']; const index = order.indexOf(stage); return index > 0 ? order[index - 1] : null; }
function withRuntime(work: Work, runtime: WorkRuntime): Work { const state = runtime[work.id]; return state ? { ...work, status: stageLabel(state.stage), technicianStage: state.stage } : work; }
function emptyBlocks(): Record<CheckBlockId, CheckStatus> { return { hoja: 'Sin revisar', guias: 'Sin revisar', muelles: 'Sin revisar', automatizacion: 'Sin revisar', estructura: 'Sin revisar', funcionamiento: 'Sin revisar' }; }
function statusTone(status: CheckStatus): Severity { if (status === 'Favorable' || status === 'Favorable tras intervención') return 'ok'; if (status === 'Problema leve') return 'warn'; if (status === 'No favorable') return 'danger'; if (status === 'No aplicable') return 'muted'; return 'info'; }
function primaryTechnicianAction(stage: TechnicianStage) { if (stage === 'downloaded') return 'Iniciar desplazamiento'; if (stage === 'traveling') return 'He llegado / Iniciar intervención'; if (stage === 'working') return 'Continuar trabajo'; if (stage === 'review') return 'Revisar y finalizar'; if (stage === 'readyToSend') return 'Enviar trabajo'; return 'Trabajo enviado'; }
function nextStage(stage: TechnicianStage): TechnicianStage { if (stage === 'downloaded') return 'traveling'; if (stage === 'traveling') return 'working'; if (stage === 'working') return 'review'; if (stage === 'review') return 'readyToSend'; if (stage === 'readyToSend') return 'sent'; return 'sent'; }
function stageLabel(stage: TechnicianStage) { return ({ downloaded: 'Trabajo descargado', traveling: 'En desplazamiento', working: 'En intervención', review: 'Finalizado técnicamente', readyToSend: 'Pendiente de envío', sent: 'Enviado' })[stage]; }
function toneForStage(stage: TechnicianStage): Severity { if (stage === 'sent') return 'ok'; if (stage === 'readyToSend' || stage === 'review') return 'warn'; if (stage === 'working' || stage === 'traveling') return 'info'; return 'muted'; }
function toneForStatus(status: string): Severity { if (status.includes('cerrado') || status.includes('finalizado')) return 'ok'; if (status.includes('material') || status.includes('parcial')) return 'warn'; if (status.includes('pendiente')) return 'info'; if (status.includes('intervención') || status.includes('desplazamiento')) return 'info'; return 'muted'; }
function toneForEquipment(status: string): Severity { if (status.includes('crítica') || status.includes('Crítica')) return 'danger'; if (status.includes('Pendiente') || status.includes('material')) return 'warn'; if (status.includes('Operativa')) return 'ok'; return 'info'; }
function iconForTone(tone: Severity) { if (tone === 'ok') return <CheckCircle2 size={14} />; if (tone === 'danger' || tone === 'warn') return <AlertTriangle size={14} />; if (tone === 'maintenance') return <Wrench size={14} />; if (tone === 'commercial') return <BriefcaseBusiness size={14} />; return <Bell size={14} />; }
function initials(name: string) { return name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(); }
function formatCurrency(value: number) { return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(value); }

export default App;
