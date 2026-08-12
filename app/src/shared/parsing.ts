/**
 * Pure parsing helpers shared by main-process services.
 * Kept free of `fs` / `better-sqlite3` imports so they are unit-testable
 * outside the Electron runtime.
 */

/**
 * Extracts the GitHub username from a profile URL or a bare handle.
 * Handles trailing slashes, query strings, `www.`, `@handle`, and
 * repo URLs (github.com/user/repo -> user).
 */
export function extractUsername(input: string): string {
  let s = (input ?? '').trim();
  if (!s) return '';
  s = s.split(/[?#]/)[0].replace(/\/+$/, '');
  s = s.replace(/^@/, '');
  const m = s.match(/github\.com\/([^/]+)/i);
  if (m) return m[1].trim();
  if (s.includes('/')) return s.split('/').filter(Boolean).pop()!.trim();
  return s;
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes ("")
 * embedded commas/newlines, CRLF, and a UTF-8 BOM from Excel exports.
 * Avoids pulling in a dependency for a small, well-defined format.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      // handled by the \n branch
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/**
 * Parses GitHub's contribution-calendar HTML fragment into absolute per-day counts.
 *
 * The calendar renders one <td class="ContributionCalendar-day" data-date="YYYY-MM-DD" id="...">
 * per day, and a sibling <tool-tip for="<that id>">N contributions on Month Dth.</tool-tip>
 * carrying the count. Days with no activity say "No contributions on ...".
 */
export function parseContributionHtml(html: string): {
  days: Array<{ date: string; count: number }>;
  headlineTotal: number;
} {
  const idToDate = new Map<string, string>();
  for (const m of html.matchAll(/<td[^>]*ContributionCalendar-day[^>]*>/g)) {
    const tag = m[0];
    const date = /data-date="([\d-]+)"/.exec(tag)?.[1];
    const id = /id="([^"]+)"/.exec(tag)?.[1];
    if (date && id) idToDate.set(id, date);
  }

  const days = new Map<string, number>();
  for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const date = idToDate.get(m[1]);
    if (!date) continue;
    const num = /^([\d,]+)\s+contribution/i.exec(m[2].trim());
    days.set(date, num ? Number(num[1].replace(/,/g, '')) : 0);
  }

  // Any calendar cell without a matching tooltip is a zero day.
  for (const date of idToDate.values()) {
    if (!days.has(date)) days.set(date, 0);
  }

  const headline = /([\d,]+)\s*\n?\s*contributions?/i.exec(html);

  return {
    days: [...days.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    headlineTotal: headline ? Number(headline[1].replace(/,/g, '')) : 0,
  };
}
