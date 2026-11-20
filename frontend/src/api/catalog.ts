import { api } from "./client";
import type {
  Filters,
  Movie,
  MoviePage,
  ShowtimeGroup,
} from "../types/catalog";

export async function fetchCities() {
  const res = await api.get<{ cities: string[] }>("/api/cities");
  return res.data.cities;
}

// axios `params` turns the object into ?city=...&page=... and skips undefined values.
export async function fetchMovies(filters: Filters, page: number) {
  const res = await api.get<MoviePage>("/api/movies", {
    params: { ...filters, status: "now_showing", page, limit: 12 },
  });
  return res.data;
}

export async function fetchMovie(id: string) {
  const res = await api.get<{ movie: Movie }>(`/api/movies/${id}`);
  return res.data.movie;
}

export async function fetchMovieShowtimes(id: string, filters: Filters) {
  const res = await api.get<{ groups: ShowtimeGroup[] }>(
    `/api/movies/${id}/showtimes`,
    { params: filters },
  );
  return res.data.groups;
}
