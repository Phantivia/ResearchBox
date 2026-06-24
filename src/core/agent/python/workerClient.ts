export type PyOutput = {
  stdout: string;
  result: string;
  error?: string;
};

export type PyodideClient = {
  run(code: string, signal: AbortSignal): Promise<PyOutput>;
};

type WorkerFactory = (scriptURL: URL, options?: WorkerOptions) => Worker;

type RunMessage = { type: "run"; id: number; code: string };
type ResultMessage = {
  type: "result";
  id: number;
  stdout: string;
  result: string;
  error?: string;
};

type QueueTask = {
  id: number;
  code: string;
  resolve: (output: PyOutput) => void;
  reject: (reason: unknown) => void;
  signal: AbortSignal;
  onAbort: () => void;
};

const defaultCreateWorker: WorkerFactory = (scriptURL, options) =>
  new Worker(scriptURL, options);

let clientInstance: PyodideClientImpl | null = null;

function abortError(signal: AbortSignal): DOMException {
  if (signal.reason instanceof DOMException) {
    return signal.reason;
  }
  if (signal.reason instanceof Error) {
    return new DOMException(signal.reason.message, "AbortError");
  }
  return new DOMException("Aborted", "AbortError");
}

class PyodideClientImpl implements PyodideClient {
  private worker: Worker | null = null;
  private readonly createWorker: WorkerFactory;
  private nextId = 1;
  private readonly waitQueue: QueueTask[] = [];
  private activeTask: QueueTask | null = null;

  constructor(createWorker: WorkerFactory) {
    this.createWorker = createWorker;
  }

  run(code: string, signal: AbortSignal): Promise<PyOutput> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(abortError(signal));
        return;
      }

      const task: QueueTask = {
        id: this.nextId++,
        code,
        resolve,
        reject,
        signal,
        onAbort: () => {
          this.handleAbort(task);
        },
      };

      signal.addEventListener("abort", task.onAbort, { once: true });
      this.waitQueue.push(task);
      this.drainQueue();
    });
  }

  destroy(): void {
    this.resetWorker();
    this.activeTask = null;
    this.waitQueue.length = 0;
  }

  private resetWorker(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private ensureWorker(): void {
    if (this.worker) {
      return;
    }

    this.worker = this.createWorker(
      new URL("../../../workers/pyodide.worker.ts", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = (event: MessageEvent<ResultMessage>) => {
      queueMicrotask(() => {
        this.handleResult(event.data);
      });
    };
  }

  private handleAbort(task: QueueTask): void {
    task.signal.removeEventListener("abort", task.onAbort);

    if (this.activeTask === task) {
      this.resetWorker();
      this.activeTask = null;
      task.reject(abortError(task.signal));
      this.drainQueue();
      if (this.waitQueue.length === 0 && this.activeTask === null) {
        clientInstance = null;
      }
      return;
    }

    const index = this.waitQueue.indexOf(task);
    if (index >= 0) {
      this.waitQueue.splice(index, 1);
      task.reject(abortError(task.signal));
    }
  }

  private handleResult(message: ResultMessage): void {
    if (message.type !== "result" || !this.activeTask || message.id !== this.activeTask.id) {
      return;
    }

    const task = this.activeTask;
    this.activeTask = null;
    task.signal.removeEventListener("abort", task.onAbort);

    const output: PyOutput = {
      stdout: message.stdout,
      result: message.result,
      ...(message.error !== undefined ? { error: message.error } : {}),
    };

    task.resolve(output);
    this.drainQueue();
  }

  private drainQueue(): void {
    if (this.activeTask || this.waitQueue.length === 0) {
      return;
    }

    const task = this.waitQueue.shift();
    if (!task) {
      return;
    }

    if (task.signal.aborted) {
      task.reject(abortError(task.signal));
      this.drainQueue();
      return;
    }

    this.ensureWorker();
    this.activeTask = task;

    const payload: RunMessage = {
      type: "run",
      id: task.id,
      code: task.code,
    };
    this.worker!.postMessage(payload);
  }
}

export function getPyodideClient(options?: {
  createWorker?: WorkerFactory;
}): PyodideClient {
  clientInstance ??= new PyodideClientImpl(options?.createWorker ?? defaultCreateWorker);
  return clientInstance;
}

export function resetPyodideClientForTests(): void {
  clientInstance?.destroy();
  clientInstance = null;
}
