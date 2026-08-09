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
    return expectData<any[]>(supabase.from('v_technician_daily_schedule').select('*').eq('technician_id', profileId).order('assignment_date', { ascending: true }).order('planned_start_time', { ascending: true }));
  },
  async assignmentHistory() {
    return expectData<any[]>(supabase.rpc('technician_assignment_history'));
  },
};
