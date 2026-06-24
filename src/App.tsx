import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell, ProjectScope } from "./ui/shell";
import { Welcome } from "./pages/Welcome";
import { PaperBox } from "./pages/PaperBox";
import { Dummy } from "./pages/Dummy";
import { Reader } from "./pages/Reader";
import { SettingsPage } from "./ui/settings";
import AgentChat from "./pages/AgentChat";
import { ChatBoxArtifacts } from "./pages/ChatBoxArtifacts";

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Welcome />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/p/:projectId" element={<ProjectScope />}>
            <Route index element={<Navigate to="paper-box" replace />} />
            <Route path="chat-box" element={<AgentChat />} />
            <Route path="chat-box/artifacts" element={<ChatBoxArtifacts />} />
            <Route path="agent" element={<Navigate to="../chat-box" replace />} />
            <Route path="paper-box" element={<PaperBox />} />
            <Route path="dummy" element={<Dummy />} />
            <Route path="paper/:routeId" element={<Reader />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
