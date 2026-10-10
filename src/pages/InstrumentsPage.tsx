import { useState } from 'react';
import { Plus, Timer, Trash2 } from 'lucide-react';
import { api, type Instrument } from '../api';
import { useData } from '../lib/useData';

export function InstrumentsPage() {
  const instruments = useData(api.instruments);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    }
    instruments.reload();
  }

  return (
    <div className="page narrow">
      <section className="panel">
        <div className="panel-head">
          <h2>Instruments</h2>
        </div>
        <p className="muted small">
          Each PDF can belong to one instrument or to everyone. In show mode, an instrument without its own part
          falls back to the shared sheet, then to a placeholder. Turn on the metronome for instruments that
          should see the tempo blink.
        </p>

        <ul className="instrument-list">
          {instruments.data?.map((i) => (
            <InstrumentRow key={i.id} instrument={i} run={run} />
          ))}
        </ul>

        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            run(() => api.createInstrument({ name: name.trim() }));
            setName('');
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add instrument, e.g. Saxophone" />
          <button className="btn primary icon" disabled={!name.trim()} title="Add instrument">
            <Plus size={18} />
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}

function InstrumentRow({ instrument, run }: { instrument: Instrument; run: (a: () => Promise<unknown>) => void }) {
  const [name, setName] = useState(instrument.name);
  return (
    <li className="instrument-row">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() !== instrument.name && run(() => api.updateInstrument(instrument.id, { name }))}
      />
      <label className={`toggle ${instrument.metronome ? 'on' : ''}`} title="Show visual metronome in show mode">
        <input
          type="checkbox"
          checked={instrument.metronome}
          onChange={(e) => run(() => api.updateInstrument(instrument.id, { metronome: e.target.checked }))}
        />
        <Timer size={14} /> Metronome
      </label>
      <button
        className="btn ghost icon danger"
        title="Delete instrument"
        onClick={() => confirm(`Delete ${instrument.name}?`) && run(() => api.deleteInstrument(instrument.id))}
      >
        <Trash2 size={16} />
      </button>
    </li>
  );
}
