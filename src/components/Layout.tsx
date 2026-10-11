import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { CalendarDays, Dumbbell, Library, Music, SlidersHorizontal } from 'lucide-react';
import { api } from '../api';
import { useData } from '../lib/useData';
import { useMyInstrument } from '../lib/myInstrument';
import { InstrumentSelect } from './InstrumentSelect';

export function Layout() {
  // Reload on navigation so instruments added or renamed on the Instruments page show up.
  const { pathname } = useLocation();
  const instruments = useData(api.instruments, [pathname]);
  const [instrumentId, setInstrumentId] = useMyInstrument();

  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/gigs" className="brand" aria-label="Bar Number One">
          <img src="/bar_nro_1_logo.png" alt="Bar nr. 1" />
        </NavLink>
        <nav className="nav">
          <NavLink to="/gigs" title="Gigs">
            <CalendarDays size={16} /> <span className="nav-label">Gigs</span>
          </NavLink>
          <NavLink to="/practice" title="Practice">
            <Dumbbell size={16} /> <span className="nav-label">Practice</span>
          </NavLink>
          <NavLink to="/songs" title="Songs">
            <Library size={16} /> <span className="nav-label">Songs</span>
          </NavLink>
          <NavLink to="/instruments" title="Instruments & singers">
            <SlidersHorizontal size={16} /> <span className="nav-label">Instruments</span>
          </NavLink>
        </nav>
        <label className="my-instrument" title="Your instrument on this device: which parts you see, everywhere">
          <Music size={15} />
          <InstrumentSelect
            instruments={instruments.data ?? []}
            value={instrumentId}
            onChange={setInstrumentId}
            emptyLabel="No instrument"
          />
        </label>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
