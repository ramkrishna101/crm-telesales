import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT_PX = 768;

function getMatches(query: string) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(query).matches;
}

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT_PX) {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [isMobile, setIsMobile] = useState(() => getMatches(query));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mediaQuery = window.matchMedia(query);
    const updateMatches = (event?: MediaQueryListEvent) => {
      setIsMobile(event?.matches ?? mediaQuery.matches);
    };

    updateMatches();
    mediaQuery.addEventListener('change', updateMatches);

    return () => {
      mediaQuery.removeEventListener('change', updateMatches);
    };
  }, [query]);

  return isMobile;
}