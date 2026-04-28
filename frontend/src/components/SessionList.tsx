import type { SessionItem } from '../api';

interface Props {
  sessions: SessionItem[];
  onSelect: (fileId: string) => void;
}

const mono  = "'JetBrains Mono', monospace";
const serif = "'Playfair Display', Georgia, serif";

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(iso));
  } catch {
    return '';
  }
}

export default function SessionList({ sessions, onSelect }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl p-16 text-center" style={{ border: '1px dashed var(--border)' }}>
        <p style={{ fontFamily: serif, color: 'var(--text-dim)', fontStyle: 'italic' }} className="text-xl mb-2">
          No previous sessions
        </p>
        <p style={{ fontFamily: mono, color: 'var(--text-faint)', fontSize: '11px', letterSpacing: '0.06em' }} className="uppercase">
          upload a case to begin
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0">
      {sessions.map((s) => (
        <li key={s.file_id}>
          <button
            type="button"
            onClick={() => onSelect(s.file_id)}
            className="w-full text-left rounded-xl p-5 transition-all duration-200"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface)';
              e.currentTarget.style.borderColor = 'var(--gold-card-h)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--card)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <p className="truncate mb-4 text-sm font-medium" style={{ color: 'var(--text)' }}>
              {s.file_name}
            </p>
            <div className="flex items-center justify-between">
              <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px', letterSpacing: '0.06em' }} className="uppercase">
                {s.message_count} msg{s.message_count !== 1 ? 's' : ''}
              </span>
              <span style={{ fontFamily: mono, color: 'var(--text-dim)', fontSize: '10px' }}>
                {formatDate(s.last_active_at)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
