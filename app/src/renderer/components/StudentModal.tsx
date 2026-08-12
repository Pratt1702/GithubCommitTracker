import { useState } from 'react';
import type { Cohort, StudentInput, StudentStats } from '../../shared/types';
import { Modal } from './ui';

interface Props {
  /** Existing student when editing; null when adding a new one. */
  student: StudentStats | null;
  cohortId: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function StudentModal({ student, cohortId, onClose, onSaved }: Props) {
  const [input, setInput] = useState<StudentInput>({
    name: student?.name ?? '',
    regNo: student?.regNo ?? '',
    email: student?.email ?? '',
    dept: student?.dept ?? '',
    link: student?.link ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verify, setVerify] = useState<'idle' | 'checking' | 'ok' | 'missing'>('idle');

  const set = (k: keyof StudentInput) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput((p) => ({ ...p, [k]: e.target.value }));
    if (k === 'link') setVerify('idle');
  };

  const checkGithub = async () => {
    if (!input.link.trim()) return;
    setVerify('checking');
    try {
      setVerify((await window.tracker.students.verify(input.link)) ? 'ok' : 'missing');
    } catch {
      setVerify('missing');
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (student) {
        await window.tracker.students.update(student.id, input);
        onSaved(`${input.name} updated.`);
      } else {
        const { id, created } = await window.tracker.students.add(cohortId, input);
        // A brand-new student has no history yet, so pull it immediately.
        if (created) window.tracker.refresh.one(id).catch(() => {});
        onSaved(created ? `${input.name} added — fetching their history…` : `${input.name} already existed; updated.`);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={student ? 'Edit student' : 'Add student'}
      subtitle={
        student
          ? 'Changing the GitHub account clears that student’s collected history and re-fetches it.'
          : 'Paste the student’s GitHub profile URL or just their username.'
      }
      onClose={onClose}
    >
      {error && <div className="notice alert">{error}</div>}

      <div className="form-row">
        <span className="label">Name *</span>
        <input className="field" autoFocus value={input.name} onChange={set('name')} placeholder="Full name" />
      </div>

      <div className="form-grid">
        <div className="form-row">
          <span className="label">Register number</span>
          <input className="field" value={input.regNo} onChange={set('regNo')} placeholder="Optional" />
        </div>
        <div className="form-row">
          <span className="label">Department</span>
          <input className="field" value={input.dept} onChange={set('dept')} placeholder="CSE" />
        </div>
        <div className="form-row">
          <span className="label">Email</span>
          <input className="field" value={input.email} onChange={set('email')} placeholder="Optional" />
        </div>
      </div>

      <div className="form-row">
        <span className="label">GitHub profile *</span>
        <div className="row tight">
          <input
            className="field"
            value={input.link}
            onChange={set('link')}
            onBlur={checkGithub}
            placeholder="https://github.com/username"
          />
          <button className="btn sm" onClick={checkGithub} disabled={!input.link.trim()}>
            Check
          </button>
        </div>
        {verify === 'checking' && (
          <span className="dim" style={{ fontSize: 'var(--fs-sm)' }}>
            <span className="spinner" /> checking GitHub…
          </span>
        )}
        {verify === 'ok' && (
          <span className="pos" style={{ fontSize: 'var(--fs-sm)' }}>
            ✓ profile exists
          </span>
        )}
        {verify === 'missing' && (
          <span className="neg" style={{ fontSize: 'var(--fs-sm)' }}>
            ✗ no public GitHub profile found at that address
          </span>
        )}
      </div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn primary" onClick={submit} disabled={busy || !input.name.trim() || !input.link.trim()}>
          {busy ? 'Saving…' : student ? 'Save changes' : 'Add student'}
        </button>
      </div>
    </Modal>
  );
}

/** Moves a student into another cohort, keeping their collected history. */
export function MoveStudentModal({
  student,
  cohorts,
  currentCohortId,
  onClose,
  onMoved,
}: {
  student: StudentStats;
  cohorts: Cohort[];
  currentCohortId: number;
  onClose: () => void;
  onMoved: (message: string) => void;
}) {
  const options = cohorts.filter((c) => c.id !== currentCohortId);
  const [target, setTarget] = useState<number>(options[0]?.id ?? 0);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal title={`Move ${student.name}`} subtitle="Their contribution history moves with them." onClose={onClose}>
      {error && <div className="notice alert">{error}</div>}

      {!options.length ? (
        <div className="notice">There is no other cohort to move this student into yet.</div>
      ) : (
        <div className="form-row">
          <span className="label">Destination cohort</span>
          <select className="field" value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={!options.length}
          onClick={async () => {
            try {
              await window.tracker.students.move(student.id, target);
              onMoved(`${student.name} moved.`);
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            }
          }}
        >
          Move student
        </button>
      </div>
    </Modal>
  );
}
