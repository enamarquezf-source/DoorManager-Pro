/** Door frame with an open leaf: shared vector identity, legible at small sizes. */
export function BrandMark({ className = '', size = 32 }: { className?: string; size?: number }) {
 return <svg className={className} width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false"><path d="M8 40V8h27v32" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="m16 13 19-5v32l-19-5V13Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="M4 40h39M16 19l19-3M16 26l19-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="29" cy="30" r="1.7" fill="currentColor"/></svg>;
}
