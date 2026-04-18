const WEB_TOUR_COMPLETED_KEY = 'traxettle.web.tour.completed';

export function hasCompletedWebTour(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(WEB_TOUR_COMPLETED_KEY) === 'true';
}

export function markWebTourCompleted(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(WEB_TOUR_COMPLETED_KEY, 'true');
}

export function resetWebTourCompletion(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(WEB_TOUR_COMPLETED_KEY);
}
