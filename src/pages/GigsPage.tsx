import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Play, Plus } from 'lucide-react';
import { api } from '../api';
import { useData } from '../lib/useData';

export function GigsPage() {
  const gigs = useData(api.gigs);
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', date: localToday() });

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    const gig = await api.createGig(form);
    navigate(`/gigs/${gig.id}`);
  }

  const all = gigs.data ?? [];
  const today = localToday();
  const todays = all.filter((g) => g.date === today);
  // Nothing on today: point at the next upcoming gig instead.
  const next = todays.length
    ? null
    : all.filter((g) => g.date && g.date > today).sort((a, b) => a.date!.localeCompare(b.date!))[0];
  const featured = todays.length ? todays : next ? [next] : [];
  // Newest date first, undated gigs last.
  const sorted = [...all].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.id - a.id);

  return (
    <div className="page">
      {featured.map((g) => (
        <section key={g.id} className={`panel featured-gig ${todays.length ? 'today' : 'next'}`}>
          <div className="featured-gig-main">
            <span className="featured-label">
              <CalendarCheck size={14} /> {todays.length ? 'Today' : `Next gig · ${formatDate(g.date!)}`}
            </span>
            <Link to={`/gigs/${g.id}`} className="featured-gig-name">
              {g.name}
            </Link>
            <span className="muted small">
              {g.song_count} songs · <Link to={`/gigs/${g.id}`}>Edit setlist</Link>
            </span>
          </div>
          <Link
            to={`/gigs/${g.id}/show`}
            className={`btn ${todays.length ? 'primary' : ''} featured-start ${g.song_count ? '' : 'disabled'}`}
          >
            <Play size={18} /> Start show
          </Link>
        </section>
      ))}

      <form className="panel new-gig" onSubmit={create}>
        <h2>New gig</h2>
        <div className="field-grid">
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Kissanristiäiset"
              required
            />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </label>
        </div>
        <button className="btn primary" disabled={!form.name.trim()}>
          <Plus size={16} /> Create gig
        </button>
      </form>

      <section className="all-gigs">
        <h2>All gigs</h2>
        <div className="gig-grid">
          {sorted.map((g) => (
            <div key={g.id} className={`panel gig-card ${g.date === today ? 'today' : ''} ${g.date && g.date < today ? 'past' : ''}`}>
              <Link to={`/gigs/${g.id}`} className="gig-card-main">
                <h3>{g.name}</h3>
                <div className="gig-meta">
                  {g.date && (
                    <span>
                      <CalendarDays size={14} /> {g.date === today ? 'Today' : formatDate(g.date)}
                    </span>
                  )}
                </div>
                <div className="gig-meta">
                  <span className="pill">{g.song_count} songs</span>
                </div>
              </Link>
              <Link to={`/gigs/${g.id}/show`} className="btn primary icon round" title="Start show">
                <Play size={18} />
              </Link>
            </div>
          ))}
          {all.length === 0 && <p className="muted">No gigs yet. Create one above, then add songs to its setlist.</p>}
        </div>
      </section>
    </div>
  );
}

/** Today's date as YYYY-MM-DD in local time (gig dates have no time zone). */
function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatDate(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
