import { supabase } from '../lib/supabase/client';
import { currentProfileId, expectData } from './query';

export const assignmentsService = {
  async dailySchedule(date = new Date().toISOString().slice(0, 10)) {
    const profileId = await currentProfileId();
    return expectData<any[]>(supabase.from('v_technician_daily_schedule').select('*').eq('technician_id', profileId).eq('assignment_date', date).order('planned_start_time'));
  },
  async assignedWork() {
    const profileId = await currentProfileId();
    return expectData<any[]>(supabase.from('v_technician_daily_schedule').select('*').eq('technician_id', profileId).order('assignment_date', { ascending: true }).order('planned_start_time', { ascending: true }));
  },
};
