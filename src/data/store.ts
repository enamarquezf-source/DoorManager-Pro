import { useEffect, useMemo, useState } from 'react';
import { initialDemoStore } from './initialData';
import type { AlertItem, CheckRecord, DemoStore, Opportunity, Part, Work } from './models';

export const demoStoreKey = 'dmp-central-demo-store-v1';

function cloneInitialStore(): DemoStore {
  return JSON.parse(JSON.stringify(initialDemoStore)) as DemoStore;
}

function readStore(): DemoStore {
  const stored = localStorage.getItem(demoStoreKey);
  if (!stored) return cloneInitialStore();
  try {
    return { ...cloneInitialStore(), ...JSON.parse(stored) } as DemoStore;
  } catch {
    return cloneInitialStore();
  }
}

export function useDemoStore() {
  const [store, setStore] = useState<DemoStore>(() => readStore());

  const save = (recipe: (current: DemoStore) => DemoStore) => {
    setStore((current) => {
      const next = recipe(current);
      localStorage.setItem(demoStoreKey, JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    localStorage.setItem(demoStoreKey, JSON.stringify(store));
  }, []);

  const actions = useMemo(() => ({
    resetDemo() {
      localStorage.removeItem(demoStoreKey);
      const next = cloneInitialStore();
      setStore(next);
      return next;
    },
    setRuntime(runtime: DemoStore['runtime']) {
      save((current) => ({ ...current, runtime }));
    },
    setChecks(checks: DemoStore['checks']) {
      save((current) => ({ ...current, checks }));
    },
    upsertWork(work: Work) {
      save((current) => ({
        ...current,
        works: current.works.some((item) => item.id === work.id) ? current.works.map((item) => item.id === work.id ? work : item) : [...current.works, work],
        parts: syncPart(current.parts, work),
      }));
    },
    updateWorkStage(workId: string, stage: DemoStore['runtime'][string]['stage'], label: string) {
      save((current) => ({
        ...current,
        runtime: { ...current.runtime, [workId]: { ...(current.runtime[workId] ?? { stage, history: [] }), stage, history: [...(current.runtime[workId]?.history ?? []), `${now()} Estado cambiado a “${label}”`] } },
        works: current.works.map((work) => work.id === workId ? { ...work, status: label, technicianStage: stage, history: [...work.history, `${now()} ${label}`] } : work),
        parts: current.parts.map((part) => current.works.find((work) => work.id === workId)?.partId === part.id ? { ...part, status: label, updatedAt: new Date().toISOString().slice(0, 10) } : part),
      }));
    },
    requestReturn(workId: string, userName: string) {
      save((current) => ({
        ...current,
        runtime: { ...current.runtime, [workId]: { ...(current.runtime[workId] ?? { stage: 'sent', history: [] }), returnRequested: true, history: [...(current.runtime[workId]?.history ?? []), `${now()} Devolución solicitada a SAT por ${userName}`] } },
        works: current.works.map((work) => work.id === workId ? { ...work, status: 'Devolución solicitada', history: [...work.history, `${now()} Devolución solicitada por ${userName}`] } : work),
      }));
    },
    upsertCheck(check: CheckRecord) {
      save((current) => ({ ...current, checks: current.checks.some((item) => item.id === check.id) ? current.checks.map((item) => item.id === check.id ? check : item) : [...current.checks, check] }));
    },
    upsertAlert(alert: AlertItem) {
      save((current) => ({ ...current, alerts: current.alerts.some((item) => item.id === alert.id) ? current.alerts.map((item) => item.id === alert.id ? alert : item) : [...current.alerts, alert] }));
    },
    markAlertRead(alertId: string, read = true) {
      save((current) => ({ ...current, alerts: current.alerts.map((alert) => alert.id === alertId ? { ...alert, read } : alert) }));
    },
    closeAlert(alertId: string) {
      save((current) => ({ ...current, alerts: current.alerts.map((alert) => alert.id === alertId ? { ...alert, status: 'cerrado', read: true } : alert) }));
    },
    createOpportunityFromCheck(checkId: string) {
      let created: Opportunity | undefined;
      save((current) => {
        const check = current.checks.find((item) => item.id === checkId);
        const work = check ? current.works.find((item) => item.id === check.workId) : undefined;
        if (!check || !work) return current;
        const id = `OPO-${9000 + current.opportunities.length + 1}`;
        const budgetId = `PRE-${3050 + current.budgets.length}`;
        created = { id, origin: 'Deficiencia de check', partId: check.partId, workId: check.workId, equipmentId: check.equipmentId, deficiency: check.deficiency ?? 'Deficiencia detectada en check', clientId: work.clientId, owner: 'Laura Sánchez', status: 'Abierta', budgetId };
        return {
          ...current,
          checks: current.checks.map((item) => item.id === checkId ? { ...item, opportunityId: id } : item),
          opportunities: [...current.opportunities, created],
          budgets: [...current.budgets, { id: budgetId, clientId: work.clientId, equipmentId: work.equipmentId, amount: 0, version: 'v1', status: 'pendiente', date: new Date().toISOString().slice(0, 10), owner: 'Laura Sánchez', sourceWorkId: work.id, opportunityId: id }],
          alerts: [...current.alerts, { id: `av-com-${Date.now()}`, profiles: ['comercial'], title: 'Nueva oportunidad por deficiencia', detail: `${work.id} genera presupuesto pendiente`, severity: 'commercial', date: new Date().toISOString().slice(0, 10), entity: id, relatedType: 'opportunity', relatedId: id, owner: 'Laura Sánchez', status: 'nuevo', read: false, route: '/app/oportunidades' }],
        };
      });
      return created;
    },
  }), []);

  return { store, actions };
}

function syncPart(parts: Part[], work: Work) {
  const part = { id: work.partId, workId: work.id, clientId: work.clientId, centerId: work.centerId, equipmentId: work.equipmentId, title: work.type, description: work.fault, status: work.status, createdAt: work.date, updatedAt: new Date().toISOString().slice(0, 10) };
  return parts.some((item) => item.id === work.partId) ? parts.map((item) => item.id === work.partId ? part : item) : [...parts, part];
}

function now() {
  return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

export type DemoActions = ReturnType<typeof useDemoStore>['actions'];
