import { getCurrentFocusId, setFocus } from '../hooks/useFocus';

type DefaultGridFocusOptions = {
  enabled: boolean;
  targetId?: string;
  delayMs?: number;
};

export function scheduleDefaultGridFocus({
  enabled,
  targetId = 'content-0-0',
  delayMs = 0,
}: DefaultGridFocusOptions) {
  if (!enabled) return;

  if (getCurrentFocusId() !== targetId) {
    setFocus(targetId);
  }

  const timer = window.setTimeout(() => {
    if (getCurrentFocusId() === targetId) return;
    setFocus(targetId);
  }, delayMs);

  return () => window.clearTimeout(timer);
}
