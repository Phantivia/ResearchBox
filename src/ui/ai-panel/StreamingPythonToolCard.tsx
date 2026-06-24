import { PythonCodePanel, type PythonCodePanelProps } from "./PythonCodePanel";

export type StreamingPythonToolCardProps = Pick<
  PythonCodePanelProps,
  "code" | "streaming"
>;

export function StreamingPythonToolCard({
  code,
  streaming = false,
}: StreamingPythonToolCardProps) {
  return <PythonCodePanel code={code} streaming={streaming} />;
}
