import { Outlet } from 'react-router-dom';

export default function POSLayout() {
  return (
    <div className="min-h-screen bg-slate-100">
      <Outlet />
    </div>
  );
}
