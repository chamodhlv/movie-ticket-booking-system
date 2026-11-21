import { useQueryClient } from "@tanstack/react-query";

// After the admin changes anything, the cached data is out of date: the admin tables AND the
// public pages (home grid, movie detail, city filter). Invalidating marks them "stale", and
// React Query refetches whichever are on screen (the rest refetch next time they're opened).
// The keys are the first element of each useQuery key used in the app.
export function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ["admin", "movies", "movie", "movie-showtimes", "cities"].map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] }),
      ),
    );
}
