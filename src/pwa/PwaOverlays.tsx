import { OfflineBanner } from "./OfflineBanner";
import { UpdatePrompt } from "./UpdatePrompt";

export function PwaOverlays() {
  return (
    <>
      <OfflineBanner />
      <UpdatePrompt />
    </>
  );
}
