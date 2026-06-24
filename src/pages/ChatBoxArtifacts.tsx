import { useParams } from "react-router-dom";
import { ArtifactDetailPanel } from "@/ui/ai-panel/ArtifactDetailPanel";
import { ArtifactListView } from "@/ui/ai-panel/ArtifactList";
import { CurrentProjectLabel } from "@/ui/shell/CurrentProjectLabel";

export function ChatBoxArtifacts() {
  const { projectId = "" } = useParams<{ projectId: string }>();

  return (
    <main className="relative z-10 flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden md:h-dvh">
      <div className="mx-auto min-h-0 w-full max-w-3xl flex-1 overflow-y-auto px-4 py-6">
        <CurrentProjectLabel />
        <ArtifactListView projectId={projectId} variant="full" />
      </div>
      <ArtifactDetailPanel />
    </main>
  );
}
