import { Outlet } from "react-router-dom";
import Navbar from "./Navbar";

// Every page inside this layout gets the navbar. <Outlet /> is where the
// matched child page (Home, Login, ...) is rendered.
export default function Layout() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar />
      <Outlet />
    </div>
  );
}
