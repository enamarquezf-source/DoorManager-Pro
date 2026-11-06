import { displayStatus, severityForStatus } from '../shared/labels';

type SectionResult = { result?: string | null; severity?: string | null };

export function checkResultLabel(result?: string | null, sections: readonly SectionResult[] = []) {
  const critical = sections.some(section =>
    ['Critica', 'Crítica'].includes(section.severity ?? '') &&
    ['Problema leve', 'No favorable'].includes(section.result ?? ''),
  );
  return critical ? 'Problema crítico' : displayStatus(result || 'Sin revisar');
}

export function checkResultTone(label: string) {
  if (label === 'Problema crítico' || label === 'No favorable') return 'danger';
  if (label === 'Problema leve') return 'warn';
  return severityForStatus(label);
}
