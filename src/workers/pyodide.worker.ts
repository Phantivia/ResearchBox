/// <reference lib="webworker" />

import { loadPyodide, type PyodideAPI } from "pyodide";

const PYODIDE_CDN = "https://cdn.jsdelivr.net/pyodide/v314.0.0/full/";

type RunMessage = { type: "run"; id: number; code: string };
type ResultMessage = {
  type: "result";
  id: number;
  stdout: string;
  result: string;
  error?: string;
};

let pyodidePromise: Promise<PyodideAPI> | null = null;
let stdoutBuffer = "";

function captureStdout(msg: string): void {
  stdoutBuffer += msg;
}

function getPyodide(): Promise<PyodideAPI> {
  pyodidePromise ??= loadPyodide({
    indexURL: PYODIDE_CDN,
    stdout: captureStdout,
    stderr: captureStdout,
  });
  return pyodidePromise;
}

function formatPythonError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatResult(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value);
}

async function handleRun(msg: RunMessage): Promise<ResultMessage> {
  stdoutBuffer = "";

  try {
    const pyodide = await getPyodide();
    stdoutBuffer = "";

    try {
      await pyodide.loadPackagesFromImports(msg.code);
      const raw = await pyodide.runPythonAsync(msg.code);
      return {
        type: "result",
        id: msg.id,
        stdout: stdoutBuffer,
        result: formatResult(raw),
      };
    } catch (error) {
      return {
        type: "result",
        id: msg.id,
        stdout: stdoutBuffer,
        result: "",
        error: formatPythonError(error),
      };
    }
  } catch (error) {
    return {
      type: "result",
      id: msg.id,
      stdout: stdoutBuffer,
      result: "",
      error: formatPythonError(error),
    };
  }
}

self.onmessage = (event: MessageEvent<RunMessage>) => {
  const msg = event.data;
  if (msg.type !== "run") {
    return;
  }

  void handleRun(msg).then((response) => {
    self.postMessage(response);
  });
};
