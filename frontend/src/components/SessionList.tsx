import type { SessionItem } from '../api';

interface Props {
  sessions: SessionItem[];
  onSelect: (fileId: string) => void;
}

const mono = "'JetBrains Mono', monospace";
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
      <div className="rounded-xl p-16 text-center" style={{ border: '1px dashed #1c1c1c' }}>
        <p style={{ fontFamily: serif, color: '#2e2a26', fontStyle: 'italic' }} className="text-xl mb-2">
          No previous sessions
        </p>
        <p
          style={{ fontFamily: mono, color: '#222220', fontSize: '11px', letterSpacing: '0.06em' }}
          className="uppercase"
        >
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
            style={{ background: '#141414', border: '1px solid #1e1e1e' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#181818';
              e.currentTarget.style.borderColor = 'rgba(201,168,76,0.2)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#141414';
              e.currentTarget.style.borderColor = '#1e1e1e';
            }}
          >
            <p className="truncate mb-4 text-sm font-medium" style={{ color: '#ddd6cc' }}>
              {s.file_name}
            </p>
            <div className="flex items-center justify-between">
              <span
                style={{ fontFamily: mono, color: '#333028', fontSize: '10px', letterSpacing: '0.06em' }}
                className="uppercase"
              >
                {s.message_count} msg{s.message_count !== 1 ? 's' : ''}
              </span>
              <span style={{ fontFamily: mono, color: '#333028', fontSize: '10px' }}>
                {formatDate(s.last_active_at)}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
