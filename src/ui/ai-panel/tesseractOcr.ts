import { createWorker, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker(["eng", "chi_sim"]);
  }
  return workerPromise;
}

export async function ocrImage(source: string | Blob): Promise<string> {
  const worker = await getWorker();
  const { data } = await worker.recognize(source);
  return data.text.trim();
}

export async function ocrImages(sources: Array<string | Blob>): Promise<string[]> {
  const worker = await getWorker();
  const results: string[] = [];
  for (const source of sources) {
    const { data } = await worker.recognize(source);
    results.push(data.text.trim());
  }
  return results;
}

export function resetOcrWorkerForTests(): void {
  workerPromise = null;
}
