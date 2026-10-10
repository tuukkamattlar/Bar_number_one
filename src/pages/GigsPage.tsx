import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Play, Plus } from 'lucide-react';
import { api } from '../api';
import { useData } from '../lib/useData';
import { instrumentName } from '../lib/parts';
import { InstrumentSelect } from '../components/InstrumentSelect';

export function GigsPage() {
  const gigs = useData(api.gigs);
  const instruments = useData(api.instruments);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', date: '', instrument_id: null as number | null });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const gig = await api.createGig(form);
    navigate(`/gigs/${gig.id}`);
  }

  return (
    <div className="page">
      <form className="panel new-gig" onSubmit={create}>
        <h2>New gig</h2>
        <div className="field-grid">
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Juhannus @ Tavastia"
              required
            />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
          <label className="field">
            <span>My instrument</span>
            <InstrumentSelect
              instruments={instruments.data ?? []}
              value={form.instrument_id}
              onChange={(instrument_id) => setForm({ ...form, instrument_id })}
            />
          </label>
        </div>
        <button className="btn primary" disabled={!form.name.trim()}>
          <Plus size={16} /> Create gig
        </button>
      </form>

      <div className="gig-grid">
        {gigs.data?.map((g) => (
          <div key={g.id} className="panel gig-card">
            <Link to={`/gigs/${g.id}`} className="gig-card-main">
              <h3>{g.name}</h3>
              <div className="gig-meta">
                {g.date && (
                  <span>
                    <CalendarDays size={14} /> {formatDate(g.date)}
                  </span>
                )}
              </div>
              <div className="gig-meta">
                <span className="pill">{g.song_count} songs</span>
                <span className="pill subtle">{instrumentName(instruments.data ?? [], g.instrument_id)}</span>
              </div>
            </Link>
            <Link to={`/gigs/${g.id}/show`} className="btn primary icon round" title="Start show">
              <Play size={18} />
            </Link>
          </div>
        ))}
        {gigs.data?.length === 0 && <p className="muted">No gigs yet. Create one above, then add songs to its setlist.</p>}
      </div>
    </div>
  );
}

export function formatDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
