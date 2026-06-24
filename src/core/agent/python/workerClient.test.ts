import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getPyodideClient,
  resetPyodideClientForTests,
  type PyOutput,
} from "./workerClient";

type RunMessage = { type: "run"; id: number; code: string };
type ResultMessage = {
  type: "result";
  id: number;
  stdout: string;
  result: string;
  error?: string;
};

class FakeWorker {
  postMessage = vi.fn<(message: RunMessage) => void>();
  terminate = vi.fn();
  onmessage: ((event: MessageEvent<ResultMessage>) => void) | null = null;

  private readonly pending = new Map<number, RunMessage>();

  reply(
    id: number,
    output: Pick<ResultMessage, "stdout" | "result" | "error">,
  ): void {
    const message = this.pending.get(id);
    if (!message) {
      throw new Error(`no pending run for id ${id}`);
    }
    this.pending.delete(id);
    this.emitResult(id, output);
  }

  emitResult(
    id: number,
    output: Pick<ResultMessage, "stdout" | "result" | "error">,
  ): void {
    queueMicrotask(() => {
      this.onmessage?.({
        data: {
          type: "result",
          id,
          stdout: output.stdout,
          result: output.result,
          ...(output.error !== undefined ? { error: output.error } : {}),
        },
      } as MessageEvent<ResultMessage>);
    });
  }

  capturePostMessage(message: RunMessage): void {
    this.pending.set(message.id, message);
  }
}

function makeWorkerFactory(worker: FakeWorker) {
  return vi.fn((_scriptURL: URL, _options?: WorkerOptions) => {
    worker.postMessage.mockImplementation((message) => {
      worker.capturePostMessage(message);
    });
    return worker as unknown as Worker;
  });
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => {
    queueMicrotask(resolve);
  });
}

afterEach(() => {
  resetPyodideClientForTests();
});

describe("getPyodideClient", () => {
  it("does not spawn a worker until the first run", async () => {
    const worker = new FakeWorker();
    const createWorker = makeWorkerFactory(worker);
    const client = getPyodideClient({ createWorker });

    expect(createWorker).not.toHaveBeenCalled();

    const runPromise = client.run("1 + 1", new AbortController().signal);
    await flushMicrotasks();

    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: "run",
      id: 1,
      code: "1 + 1",
    });

    worker.reply(1, { stdout: "", result: "2" });
    await expect(runPromise).resolves.toEqual({ stdout: "", result: "2" });
  });

  it("keeps runs serial: second run is not posted before the first resolves", async () => {
    const worker = new FakeWorker();
    const createWorker = makeWorkerFactory(worker);
    const client = getPyodideClient({ createWorker });
    const signal = new AbortController().signal;

    const first = client.run("first", signal);
    await flushMicrotasks();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: "run",
      id: 1,
      code: "first",
    });

    const second = client.run("second", signal);
    await flushMicrotasks();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    worker.reply(1, { stdout: "a", result: "1" });
    await expect(first).resolves.toEqual({ stdout: "a", result: "1" });

    await flushMicrotasks();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: "run",
      id: 2,
      code: "second",
    });

    worker.reply(2, { stdout: "b", result: "2" });
    await expect(second).resolves.toEqual({ stdout: "b", result: "2" });
  });

  it("associates responses with the correct run id", async () => {
    const worker = new FakeWorker();
    const client = getPyodideClient({ createWorker: makeWorkerFactory(worker) });
    const signal = new AbortController().signal;

    const first = client.run("first", signal);
    await flushMicrotasks();

    worker.emitResult(999, { stdout: "wrong", result: "wrong" });
    await flushMicrotasks();

    const second = client.run("second", signal);
    await flushMicrotasks();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    worker.reply(1, { stdout: "ok", result: "1" });
    await expect(first).resolves.toEqual({ stdout: "ok", result: "1" });

    await flushMicrotasks();
    expect(worker.postMessage).toHaveBeenCalledTimes(2);

    worker.reply(2, { stdout: "two", result: "2" });
    await expect(second).resolves.toEqual({ stdout: "two", result: "2" });
  });

  it("rejects the active run on abort, terminates the worker, and resets the singleton", async () => {
    const worker = new FakeWorker();
    const createWorker = makeWorkerFactory(worker);
    const client = getPyodideClient({ createWorker });
    const controller = new AbortController();

    const runPromise = client.run("slow", controller.signal);
    await flushMicrotasks();
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    controller.abort();
    await flushMicrotasks();

    await expect(runPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);

    const workerAfterAbort = new FakeWorker();
    const createWorkerAfterAbort = makeWorkerFactory(workerAfterAbort);
    const nextClient = getPyodideClient({ createWorker: createWorkerAfterAbort });
    expect(nextClient).not.toBe(client);

    const nextRun = nextClient.run("after abort", new AbortController().signal);
    await flushMicrotasks();
    expect(createWorkerAfterAbort).toHaveBeenCalledTimes(1);

    workerAfterAbort.reply(1, { stdout: "", result: "ok" });
    await expect(nextRun).resolves.toEqual({ stdout: "", result: "ok" });
  });

  it("rejects a queued run when its signal aborts before dispatch", async () => {
    const worker = new FakeWorker();
    const client = getPyodideClient({ createWorker: makeWorkerFactory(worker) });

    const firstController = new AbortController();
    const secondController = new AbortController();

    void client.run("first", firstController.signal);
    const secondPromise = client.run("second", secondController.signal);
    await flushMicrotasks();

    secondController.abort();
    await expect(secondPromise).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it("forwards python errors from the worker payload", async () => {
    const worker = new FakeWorker();
    const client = getPyodideClient({ createWorker: makeWorkerFactory(worker) });

    const runPromise = client.run("raise", new AbortController().signal);
    await flushMicrotasks();

    const output: PyOutput = {
      stdout: "trace",
      result: "",
      error: "boom",
    };
    worker.reply(1, output);
    await expect(runPromise).resolves.toEqual(output);
  });
});
