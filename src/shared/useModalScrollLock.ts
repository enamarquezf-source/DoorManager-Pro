import { useEffect } from 'react';
export function useModalScrollLock() {
 useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[]);
}
