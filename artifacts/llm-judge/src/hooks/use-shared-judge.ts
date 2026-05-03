import { useQuery, useQueryClient } from "@tanstack/react-query";

const SHARED_JUDGE_KEY = ["ui", "selectedJudgeModelId"] as const;

export function useSharedJudgeModelId() {
  const queryClient = useQueryClient();
  const { data: selectedId = "" } = useQuery<string>({
    queryKey: SHARED_JUDGE_KEY,
    queryFn: () => "",
    staleTime: Infinity,
  });
  function setSelectedId(id: string) {
    queryClient.setQueryData(SHARED_JUDGE_KEY, id);
  }
  return [selectedId, setSelectedId] as const;
}
