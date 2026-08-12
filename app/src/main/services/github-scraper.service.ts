import log from 'electron-log';
import type { DayCount } from '../../database/repositories/contribution.repository';
import { parseContributionHtml } from '../../shared/parsing';

export { parseContributionHtml };

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

export interface YearScrape {
  year: number;
  /** Absolute per-day contribution counts as reported by GitHub. */
  days: DayCount[];
  /** The headline "N contributions in YEAR" figure, used as a sanity check. */
  headlineTotal: number;
}

/** Thrown when GitHub says the profile does not exist — a data-entry problem, not a transient error. */
export class UserNotFoundError extends Error {
  constructor(username: string) {
    super(`GitHub user "${username}" not found`);
    this.name = 'UserNotFoundError';
  }
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
        signal: AbortSignal.timeout(20_000),
      });
      if (res.status === 404) throw new UserNotFoundError(url);
      if (res.status === 429 || res.status >= 500) {
        // Back off on throttling / transient server errors.
        await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (err instanceof UserNotFoundError) throw err;
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * Scrapes one calendar year of daily contributions for a username.
 * Absolute values only — no diffing, so callers can re-run this freely.
 */
export async function scrapeYear(username: string, year: number): Promise<YearScrape> {
  const url = `https://github.com/users/${encodeURIComponent(
    username,
  )}/contributions?from=${year}-01-01&to=${year}-12-31`;
  const res = await fetchWithRetry(url);
  const html = await res.text();
  const { days, headlineTotal } = parseContributionHtml(html);

  // GitHub's fragment can include leading/trailing days from adjacent years.
  const inYear = days.filter((d) => d.date.startsWith(`${year}-`));
  log.info(`Scraped ${username} ${year}: ${inYear.length} days, headline ${headlineTotal}`);
  return { year, days: inYear, headlineTotal };
}

/** Verifies a handle exists before it is added, so faculty get instant feedback on typos. */
export async function verifyUsername(username: string): Promise<boolean> {
  try {
    const res = await fetch(`https://github.com/${encodeURIComponent(username)}`, {
      method: 'HEAD',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
