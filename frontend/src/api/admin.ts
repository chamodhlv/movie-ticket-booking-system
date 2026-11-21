import { api } from "./client";
import type { Cinema, Movie, MoviePage } from "../types/catalog";
import type {
  AdminShowtime,
  CinemaInput,
  HallDetail,
  HallInput,
  HallSummary,
  MovieInput,
  ShowtimeInput,
} from "../types/admin";

// Every call here goes to /api/admin/... (admin role required by the backend), except
// the movie and cinema LISTS, which reuse the public endpoints.

// ---------- Movies ----------
// The public list is reused. Leaving `status` out returns ALL statuses, including archived.
export async function fetchAdminMovies(params: {
  q?: string;
  status?: string;
  page: number;
  limit: number;
}) {
  const res = await api.get<MoviePage>("/api/movies", { params });
  return res.data;
}
export async function createMovie(input: MovieInput) {
  return (await api.post<{ movie: Movie }>("/api/admin/movies", input)).data
    .movie;
}
export async function updateMovie(id: string, input: MovieInput) {
  return (await api.put<{ movie: Movie }>(`/api/admin/movies/${id}`, input))
    .data.movie;
}
export async function deleteMovie(id: string) {
  await api.delete(`/api/admin/movies/${id}`);
}

// ---------- Cinemas ----------
export async function fetchCinemas() {
  return (await api.get<{ cinemas: Cinema[] }>("/api/cinemas")).data.cinemas;
}
export async function createCinema(input: CinemaInput) {
  return (await api.post<{ cinema: Cinema }>("/api/admin/cinemas", input)).data
    .cinema;
}
export async function updateCinema(id: string, input: CinemaInput) {
  return (await api.put<{ cinema: Cinema }>(`/api/admin/cinemas/${id}`, input))
    .data.cinema;
}
export async function deleteCinema(id: string) {
  await api.delete(`/api/admin/cinemas/${id}`);
}

// ---------- Halls ----------
export async function fetchHalls(cinemaId?: string) {
  const res = await api.get<{ halls: HallSummary[] }>("/api/admin/halls", {
    params: cinemaId ? { cinema: cinemaId } : {},
  });
  return res.data.halls;
}
export async function fetchHall(id: string) {
  return (await api.get<{ hall: HallDetail }>(`/api/admin/halls/${id}`)).data
    .hall;
}
export async function createHall(input: HallInput) {
  return (await api.post<{ hall: HallDetail }>("/api/admin/halls", input)).data
    .hall;
}
export async function updateHall(id: string, input: HallInput) {
  return (await api.put<{ hall: HallDetail }>(`/api/admin/halls/${id}`, input))
    .data.hall;
}
export async function deleteHall(id: string) {
  await api.delete(`/api/admin/halls/${id}`);
}

// ---------- Showtimes ----------
export async function fetchAdminShowtimes(hallId: string, date: string) {
  const res = await api.get<{ showtimes: AdminShowtime[] }>(
    "/api/admin/showtimes",
    { params: { hall: hallId, date } },
  );
  return res.data.showtimes;
}
export async function createShowtime(input: ShowtimeInput) {
  await api.post("/api/admin/showtimes", input);
}
export async function updateShowtime(id: string, input: ShowtimeInput) {
  await api.put(`/api/admin/showtimes/${id}`, input);
}
export async function deleteShowtime(id: string) {
  await api.delete(`/api/admin/showtimes/${id}`);
}
