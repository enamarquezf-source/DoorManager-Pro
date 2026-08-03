import type { ActivityEvent } from './workOrderPresentation';

type SeverityDateFormatter = (value: string) => string;

export function Timeline({ items, formatDate = (value) => value }: { items: unknown[]; formatDate?: SeverityDateFormatter }) {
  return items.length ? <ol className="timeline">{items.map((item, index) => <li key={`${safeText(item, formatDate)}-${index}`}>{safeText(item, formatDate)}</li>)}</ol> : <p className="large-note">Sin eventos.</p>;
}

export function ActivityTimeline({ events, formatDate = (value) => value }: { events: ActivityEvent[]; formatDate?: SeverityDateFormatter }) {
  return events.length ? <ol className="timeline activity-timeline">{events.map((event, index) => <li key={`${event.type}-${event.date}-${index}`}><strong>{event.type}: {event.title}</strong><span>{formatDate(event.date)}{event.author ? ` · ${event.author}` : ''}</span>{event.text && <p>{event.text}</p>}</li>)}</ol> : <p className="large-note">Sin eventos.</p>;
}

function safeText(value: unknown, formatDate: SeverityDateFormatter) {
  if (value == null) return '-';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return formatDate(value.toISOString());
  return 'Evento no textual';
}
