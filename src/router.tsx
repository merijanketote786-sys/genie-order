import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 2 * 60 * 1000,
        // Lamba gcTime taa ke device copy (offline) restore ho kar rahe
        gcTime: 24 * 60 * 60 * 1000,
        networkMode: "offlineFirst",
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch the route chunk as soon as the user hovers/taps a nav item.
    defaultPreload: "intent",
    defaultPreloadDelay: 30,
    // Preloaded route data 30s tak dobara fetch nahi hoti
    defaultPreloadStaleTime: 30 * 1000,
  });

  return router;
};
