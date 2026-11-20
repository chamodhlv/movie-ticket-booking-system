import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./auth/ProtectedRoute";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AccountPage from "./pages/AccountPage";
import AdminPage from "./pages/AdminPage";
import MovieDetailPage from "./pages/MovieDetailPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/account" element={<AccountPage />} />
        </Route>

        {/* Admins only */}
        <Route element={<ProtectedRoute roles={["admin"]} />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route
          path="*"
          element={<p className="p-6 text-slate-400">Page not found.</p>}
        />
        <Route path="/" element={<HomePage />} />
        <Route path="/movies/:id" element={<MovieDetailPage />} />
        {/* Placeholder until we build the seat map in a later part */}
        <Route
          path="/showtimes/:id"
          element={
            <p className="p-6 text-slate-300">
              Seat selection comes in a later part.
            </p>
          }
        />
      </Route>
    </Routes>
  );
}
