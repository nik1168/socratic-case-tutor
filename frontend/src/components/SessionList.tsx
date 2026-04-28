import type { SessionItem } from '../api';

interface Props {
  sessions: SessionItem[];
  onSelect: (fileId: string) => void;
}

export default function SessionList({ sessions, onSelect }: Props) {
  if (sessions.length === 0) {
    return <p>No previous sessions</p>;
  }

  return (
    <ul>
      {sessions.map((s) => (
        <li key={s.file_id}>
          <button type="button" onClick={() => onSelect(s.file_id)}>
            {s.file_name}
          </button>
        </li>
      ))}
    </ul>
  );
}
