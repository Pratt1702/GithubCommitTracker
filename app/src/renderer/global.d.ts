import type { TrackerApi } from '../preload/index';

declare global {
  interface Window {
    tracker: TrackerApi;
  }
}

export {};
