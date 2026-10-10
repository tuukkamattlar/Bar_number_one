import { NavLink, Outlet } from 'react-router-dom';
import { CalendarDays, Library, SlidersHorizontal } from 'lucide-react';

export function Layout() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/gigs" className="brand" aria-label="Bar Number One">
          <img src="/bar_nro_1_logo.png" alt="Bar nr. 1" />
        </NavLink>
        <nav className="nav">
          <NavLink to="/gigs">
            <CalendarDays size={16} /> Gigs
          </NavLink>
          <NavLink to="/songs">
            <Library size={16} /> Songs
          </NavLink>
          <NavLink to="/instruments">
            <SlidersHorizontal size={16} /> Instruments
          </NavLink>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
