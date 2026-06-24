let activeAbortController: AbortController | null = null;

export function setActiveAgentAbort(controller: AbortController | null): void {
  activeAbortController = controller;
}

export function abortActiveAgentRun(): void {
  activeAbortController?.abort();
  activeAbortController = null;
}

export function getActiveAgentAbort(): AbortController | null {
  return activeAbortController;
}
