import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";

// The QueryClient is React Query's cache. Every component that fetches data
// shares it, so the same request is never duplicated and results are reused.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1, // retry a failed request once
      refetchOnWindowFocus: false, // don't refetch every time the tab is focused
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
