import { supabase } from '../lib/supabase/client';
import { currentProfileId, expectData } from './query';
import { localDateKey } from '../shared/localDate';

export const assignmentsService = {
  async dailySchedule(date = localDateKey()) {
    const profileId = await currentProfileId();
    return expectData<any[]>(supabase.from('v_technician_daily_schedule').select('*').eq('technician_id', profileId).eq('assignment_date', date).order('planned_start_time'));
  },
  async assignedWork() {
    return this.assignedActiveWork();
  },
  async assignedActiveWork() {
    const profileId = await currentProfileId();
    const rows = await expectData<any[]>(supabase.from('v_technician_daily_schedule').select('*').eq('technician_id', profileId).order('assignment_date', { ascending: true }).order('planned_start_time', { ascending: true }));
    const ids = [...new Set(rows.map((row) => row.work_order_id).filter(Boolean))];
    if (!ids.length) return rows;
    const checks = await expectData<any[]>(supabase.from('v_pending_checks').select('id,work_order_id').in('work_order_id', ids));
    const counts = new Map<string, number>();
    for (const check of checks) counts.set(check.work_order_id, (counts.get(check.work_order_id) ?? 0) + 1);
    return rows.map((row) => ({ ...row, pending_checks_count: counts.get(row.work_order_id) ?? 0 }));
  },
  async assignmentHistory() {
    return expectData<any[]>(supabase.rpc('technician_assignment_history'));
  },
};
