import { useEffect } from 'react';
let locks = 0;
let restore: (() => void) | undefined;

export function lockPageScroll() {
 if (locks++ === 0) {
  const body = document.body;
  const scrollY = window.scrollY;
  const previous = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
  body.style.position = 'fixed'; body.style.top = `-${scrollY}px`; body.style.width = '100%'; body.style.overflow = 'hidden';
  restore = () => { Object.assign(body.style, previous); window.scrollTo(0, scrollY); };
 }
 let released = false;
 return () => {
  if (released) return;
  released = true;
  if (--locks === 0) { restore?.(); restore = undefined; }
 };
}

export function useModalScrollLock(enabled = true) {
 useEffect(() => enabled ? lockPageScroll() : undefined, [enabled]);
}
