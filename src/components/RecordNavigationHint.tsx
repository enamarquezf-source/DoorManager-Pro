import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

type Props = { label: string } & (
  | { to: string; onOpen?: never; disabled?: never }
  | { to?: never; onOpen: () => void; disabled?: boolean }
);

/** The enclosing .record-surface is the target; sibling actions stay independent. */
export function RecordNavigationHint(props: Props) {
  const arrow = <ChevronRight size={19} aria-hidden="true" />;
  return props.to !== undefined
    ? <Link className="record-navigation-hint" to={props.to} aria-label={props.label}>{arrow}</Link>
    : <button type="button" className="record-navigation-hint" aria-label={props.label} disabled={props.disabled} onClick={props.onOpen}>{arrow}</button>;
}
