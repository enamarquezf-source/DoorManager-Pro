import { supabase } from '../lib/supabase/client';
import type { DemoLogin } from '../shared/types';

export const demoLogins: DemoLogin[] = [
  { name: 'Marta López', email: 'marta.lopez@dmp-demo.test', password: 'DemoSAT2026', position: 'SAT y Comercial', workspace: 'sat' },
  { name: 'Laura Sánchez', email: 'laura.sanchez@dmp-demo.test', password: 'DemoCOM2026', position: 'Comercial', workspace: 'comercial' },
  { name: 'Elena Ruiz', email: 'elena.ruiz@dmp-demo.test', password: 'DemoOFI2026', position: 'Oficina', workspace: 'oficina' },
  { name: 'Carlos Navarro', email: 'carlos.navarro@dmp-demo.test', password: 'DemoDIR2026', position: 'Gerencia', workspace: 'gerencia' },
  { name: 'Diego Martín', email: 'diego.martin@dmp-demo.test', password: 'DemoTEC2026', position: 'Técnico', workspace: 'tecnico' },
];

export const authService = {
  getSession() {
    return supabase.auth.getSession();
  },
  onAuthStateChange(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
    return supabase.auth.onAuthStateChange(callback);
  },
  signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },
  signOut() {
    return supabase.auth.signOut();
  },
};
