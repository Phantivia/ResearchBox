export class LLMError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
}

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500;
}

export async function fetchWithRetry(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetchFn(url, init);

      if (response.ok) {
        return response;
      }

      const body = await response.text();

      if (!isRetryableStatus(response.status)) {
        throw new LLMError(
          `LLM request failed with status ${response.status}`,
          response.status,
          body,
        );
      }

      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }

      throw new LLMError(
        `LLM request failed with status ${response.status}`,
        response.status,
        body,
      );
    } catch (err) {
      if (err instanceof LLMError) {
        throw err;
      }

      lastError = err;
      if (attempt < MAX_RETRIES) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
        continue;
      }
    }
  }

  throw lastError;
}
