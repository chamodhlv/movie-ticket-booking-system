import { Navigate, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import AdminLayout from "./components/admin/AdminLayout";
import ProtectedRoute from "./auth/ProtectedRoute";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import AccountPage from "./pages/AccountPage";
import MovieDetailPage from "./pages/MovieDetailPage";
import AdminMoviesPage from "./pages/admin/AdminMoviesPage";
import AdminMovieFormPage from "./pages/admin/AdminMovieFormPage";
import AdminCinemasPage from "./pages/admin/AdminCinemasPage";
import AdminHallsPage from "./pages/admin/AdminHallsPage";
import AdminHallFormPage from "./pages/admin/AdminHallFormPage";
import AdminShowtimesPage from "./pages/admin/AdminShowtimesPage";
import SeatSelectionPage from "./pages/SeatSelectionPage";
import CheckoutPage from "./pages/CheckoutPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/movies/:id" element={<MovieDetailPage />} />
        {/* Public: visitors can look at the seat map; holding seats needs a login */}
        <Route path="/showtimes/:id" element={<SeatSelectionPage />} />

        {/* Any logged-in user */}
        <Route element={<ProtectedRoute />}>
          <Route path="/checkout/:showtimeId" element={<CheckoutPage />} />
          <Route path="/account" element={<AccountPage />} />
        </Route>

        {/* Admins only. AdminLayout draws the sidebar; each child renders at its <Outlet /> */}
        <Route element={<ProtectedRoute roles={["admin"]} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="movies" replace />} />
            <Route path="movies" element={<AdminMoviesPage />} />
            <Route path="movies/new" element={<AdminMovieFormPage />} />
            <Route path="movies/:id" element={<AdminMovieFormPage />} />
            <Route path="cinemas" element={<AdminCinemasPage />} />
            <Route path="halls" element={<AdminHallsPage />} />
            <Route path="halls/new" element={<AdminHallFormPage />} />
            <Route path="halls/:id" element={<AdminHallFormPage />} />
            <Route path="showtimes" element={<AdminShowtimesPage />} />
          </Route>
        </Route>

        <Route
          path="*"
          element={<p className="p-6 text-slate-400">Page not found.</p>}
        />
      </Route>
    </Routes>
  );
}
