import type { ReactNode } from 'react';
import { useIsMobile } from '../../hooks/useIsMobile';

interface ViewportBoundaryProps {
  desktop: ReactNode;
  mobile?: ReactNode;
}

export function AuthViewportBoundary({ desktop, mobile }: ViewportBoundaryProps) {
  const isMobile = useIsMobile();

  return <>{isMobile ? (mobile ?? desktop) : desktop}</>;
}

export function AgentViewportBoundary({ desktop, mobile }: ViewportBoundaryProps) {
  const isMobile = useIsMobile();

  return <>{isMobile ? (mobile ?? desktop) : desktop}</>;
}