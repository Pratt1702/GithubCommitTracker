import { useState } from 'react';
import type { ImportResult } from '../../shared/types';
import type { ColumnMapDTO, CsvPreviewDTO } from '../../preload/index';
import { Modal } from './ui';

interface Props {
  cohortId: number;
  cohortName: string;
  onClose: () => void;
  onDone: (result: ImportResult) => void;
}

const FIELDS: Array<{ key: keyof ColumnMapDTO; label: string; required: boolean }> = [
  { key: 'name', label: 'Name', required: true },
  { key: 'link', label: 'GitHub link', required: true },
  { key: 'regNo', label: 'Register number', required: false },
  { key: 'email', label: 'Email', required: false },
  { key: 'dept', label: 'Department', required: false },
];

/**
 * CSV import for one cohort: pick file → confirm the detected column mapping
 * → import. Rows are upserted on the GitHub username, so re-importing an
 * updated roster never duplicates students or discards their history.
 */
export default function ImportModal({ cohortId, cohortName, onClose, onDone }: Props) {
  const [file, setFile] = useState<{ filePath: string; preview: CsvPreviewDTO } | null>(null);
  const [columns, setColumns] = useState<ColumnMapDTO | null>(null);
  const [replaceAll, setReplaceAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const pick = async () => {
    setError(null);
    try {
      const picked = await window.tracker.csv.pick();
      if (!picked) return;
      setFile(picked);
      setColumns(picked.preview.detected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const doImport = async () => {
    if (!file || !columns) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.tracker.csv.import(cohortId, file.filePath, { columns, replaceAll });
      setResult(res);
      onDone(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <Modal title="Import complete" onClose={onClose} wide>
        <div className="stats">
          <div className="stat">
            <div className="label">Added</div>
            <div className="stat-value">{result.inserted}</div>
          </div>
          <div className="stat">
            <div className="label">Updated</div>
            <div className="stat-value">{result.updated}</div>
          </div>
          <div className="stat">
            <div className="label">Skipped</div>
            <div className="stat-value">{result.skipped}</div>
          </div>
          <div className="stat">
            <div className="label">Rows read</div>
            <div className="stat-value">{result.totalRows}</div>
          </div>
        </div>

        {result.inserted > 0 && (
          <div className="notice">
            Fetching full GitHub history for the <strong>{result.inserted}</strong> new student
            {result.inserted === 1 ? '' : 's'} in the background. Numbers will fill in as it completes.
          </div>
        )}

        {result.errors.length > 0 && (
          <>
            <div className="label" style={{ marginBottom: 'var(--sp-2)' }}>
              {result.errors.length} row{result.errors.length === 1 ? '' : 's'} needed attention
            </div>
            <div
              className="mono"
              style={{
                maxHeight: 190,
                overflowY: 'auto',
                fontSize: 'var(--fs-sm)',
                color: 'var(--dim)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--sp-3)',
              }}
            >
              {result.errors.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Import roster CSV"
      subtitle={`Students will be added to “${cohortName}”. Matching is done on the GitHub username, so re-importing an updated sheet updates existing students instead of duplicating them.`}
      onClose={onClose}
      wide
    >
      {error && <div className="notice alert">{error}</div>}

      {!file ? (
        <>
          <div className="notice">
            The file needs a <strong>Name</strong> column and a <strong>GitHub link</strong> column.
            <strong> Register number</strong> and <strong>Department</strong> are optional. Common header spellings
            are detected automatically.
          </div>
          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary" onClick={pick}>
              Choose CSV file…
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="row between" style={{ marginBottom: 'var(--sp-3)' }}>
            <span className="mono dim truncate" style={{ fontSize: 'var(--fs-sm)' }}>
              {file.filePath}
            </span>
            <button className="btn ghost sm" onClick={pick}>
              Change file
            </button>
          </div>

          <div className="label" style={{ marginBottom: 'var(--sp-2)' }}>
            Column mapping · {file.preview.totalRows} data rows
          </div>

          <div className="form-grid">
            {FIELDS.map((f) => (
              <div className="form-row" key={f.key}>
                <span className="label">
                  {f.label}
                  {f.required ? ' *' : ''}
                </span>
                <select
                  className="field"
                  value={columns?.[f.key] ?? -1}
                  onChange={(e) => setColumns((p) => (p ? { ...p, [f.key]: Number(e.target.value) } : p))}
                >
                  <option value={-1}>{f.required ? '— select a column —' : '— not in file —'}</option>
                  {file.preview.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Column ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="label" style={{ margin: 'var(--sp-4) 0 var(--sp-2)' }}>
            Preview
          </div>
          <div className="table-wrap" style={{ maxHeight: 210 }}>
            <table>
              <thead>
                <tr>
                  {file.preview.headers.map((h, i) => (
                    <th key={i}>{h || `Column ${i + 1}`}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {file.preview.rows.map((r, i) => (
                  <tr key={i}>
                    {file.preview.headers.map((_, ci) => (
                      <td key={ci} className="truncate" style={{ maxWidth: 200 }}>
                        {r[ci] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="check" style={{ marginTop: 'var(--sp-4)' }}>
            <input type="checkbox" checked={replaceAll} onChange={(e) => setReplaceAll(e.target.checked)} />
            Remove students in this cohort that are not in the file (destructive)
          </label>

          <div className="modal-actions">
            <button className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={doImport}
              disabled={busy || !columns || columns.name < 0 || columns.link < 0}
            >
              {busy ? 'Importing…' : `Import ${file.preview.totalRows} rows`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
