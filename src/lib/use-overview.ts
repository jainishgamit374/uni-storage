import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getOverview } from "@/backend/api/nexdrive.functions";

export type Overview = Awaited<ReturnType<typeof getOverview>>;
export type Account = Overview["accounts"][number];
export type StoredFileRow = Overview["files"][number];
export type UploadJobRow = Overview["jobs"][number];

export const OVERVIEW_KEY = ["nexdrive", "overview"] as const;

export function useOverview() {
  const fetchOverview = useServerFn(getOverview);
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => fetchOverview(),
    staleTime: 10_000,
  });
}

export function useRefreshOverview() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: OVERVIEW_KEY });
}
