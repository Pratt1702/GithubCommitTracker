import { describe, expect, it } from 'vitest';
import { extractUsername, parseContributionHtml, parseCsv } from '../src/shared/parsing';
import { streaks } from '../src/shared/streaks';
import { resolveRange, weekKey, bucketKey, enumerateBuckets, previousRange } from '../src/shared/dates';

describe('extractUsername', () => {
  it('handles the shapes faculty actually paste', () => {
    expect(extractUsername('https://github.com/torvalds')).toBe('torvalds');
    expect(extractUsername('https://github.com/torvalds/')).toBe('torvalds');
    expect(extractUsername('http://www.github.com/torvalds?tab=repositories')).toBe('torvalds');
    expect(extractUsername('github.com/torvalds/linux')).toBe('torvalds');
    expect(extractUsername('torvalds')).toBe('torvalds');
    expect(extractUsername('@torvalds')).toBe('torvalds');
    expect(extractUsername('  torvalds  ')).toBe('torvalds');
    expect(extractUsername('')).toBe('');
  });
});

describe('parseContributionHtml', () => {
  const html = `
    <h2>1,234
      contributions
        in 2026
    </h2>
    <td data-date="2026-01-01" id="d1" class="ContributionCalendar-day"></td>
    <td data-date="2026-01-02" id="d2" class="ContributionCalendar-day"></td>
    <td data-date="2026-01-03" id="d3" class="ContributionCalendar-day"></td>
    <tool-tip for="d1" class="sr-only">7 contributions on January 1st.</tool-tip>
    <tool-tip for="d2" class="sr-only">No contributions on January 2nd.</tool-tip>
    <tool-tip for="d3" class="sr-only">1,024 contributions on January 3rd.</tool-tip>
  `;

  it('reads absolute per-day counts', () => {
    const { days } = parseContributionHtml(html);
    expect(days).toEqual([
      { date: '2026-01-01', count: 7 },
      { date: '2026-01-02', count: 0 },
      { date: '2026-01-03', count: 1024 },
    ]);
  });

  it('reads the headline total with thousands separators', () => {
    expect(parseContributionHtml(html).headlineTotal).toBe(1234);
  });

  it('treats calendar cells with no tooltip as zero days', () => {
    const { days } = parseContributionHtml(
      `<td data-date="2026-05-05" id="x" class="ContributionCalendar-day"></td>`,
    );
    expect(days).toEqual([{ date: '2026-05-05', count: 0 }]);
  });
});

describe('parseCsv', () => {
  it('handles quotes, embedded commas, escaped quotes and CRLF', () => {
    const rows = parseCsv('Name,Dept,Link\r\n"Doe, John",CSE,https://github.com/a\r\n"He said ""hi""",ECE,b\r\n');
    expect(rows).toEqual([
      ['Name', 'Dept', 'Link'],
      ['Doe, John', 'CSE', 'https://github.com/a'],
      ['He said "hi"', 'ECE', 'b'],
    ]);
  });

  it('strips a UTF-8 BOM from Excel exports', () => {
    expect(parseCsv('\ufeffName,Dept\nA,B')[0]).toEqual(['Name', 'Dept']);
  });

  it('drops fully blank lines', () => {
    expect(parseCsv('a,b\n\n,\nc,d').length).toBe(2);
  });
});

describe('streaks', () => {
  it('computes best and current streaks', () => {
    const dates = ['2026-02-01', '2026-02-02', '2026-02-03', '2026-02-07', '2026-02-08'];
    expect(streaks(dates, '2026-02-08')).toEqual({ best: 3, current: 2 });
  });

  it('keeps the current streak alive when today has no commits yet', () => {
    expect(streaks(['2026-02-07', '2026-02-08'], '2026-02-09').current).toBe(2);
  });

  it('breaks the current streak after a two-day gap', () => {
    expect(streaks(['2026-02-07', '2026-02-08'], '2026-02-10').current).toBe(0);
  });

  it('handles no activity', () => {
    expect(streaks([], '2026-02-10')).toEqual({ best: 0, current: 0 });
  });
});

describe('date helpers', () => {
  const today = new Date(2026, 7, 12); // 12 Aug 2026

  it('resolves the 28-day preset inclusively', () => {
    expect(resolveRange('28d', today)).toEqual({ from: '2026-07-16', to: '2026-08-12' });
  });

  it('resolves year-to-date', () => {
    expect(resolveRange('ytd', today)).toEqual({ from: '2026-01-01', to: '2026-08-12' });
  });

  it('produces a non-overlapping previous window of equal length', () => {
    const cur = resolveRange('28d', today);
    const prev = previousRange(cur);
    expect(prev).toEqual({ from: '2026-06-18', to: '2026-07-15' });
  });

  it('computes ISO week keys', () => {
    expect(weekKey('2026-01-01')).toBe('2026-W01');
    expect(bucketKey('2026-08-12', 'month')).toBe('2026-08');
    expect(bucketKey('2026-08-12', 'year')).toBe('2026');
  });

  it('enumerates gap-free buckets across a range', () => {
    const buckets = enumerateBuckets({ from: '2026-01-01', to: '2026-03-31' }, 'month');
    expect(buckets).toEqual(['2026-01', '2026-02', '2026-03']);
  });
});
