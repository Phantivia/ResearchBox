#!/usr/bin/env python3
"""Direct OpenAI-compatible streaming TTFT benchmark for translation prompts."""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

INITIAL_MAX_CHUNK_CHARS = 1500

SAMPLE_PARAGRAPH = (
    "We study the scaling behavior of transformer language models on scientific document translation. "
    "Our method preserves inline markup such as <cite data-ref=\"r1\">Smith et al.</cite> while translating "
    "only human-readable text. Experiments on arXiv abstracts show that batching blocks up to a fixed character "
    "budget reduces API round-trips without hurting BLEU. We further analyze time-to-first-token under JSON "
    "response constraints and streaming parsers that extract partial translations before the batch completes."
)

SYSTEM_PROMPT = """You are a precise academic translator.
Translate the given content blocks into zh.

Rules:
- Output ONLY valid JSON. No Markdown code fences, no preamble, no trailing commentary.
- Schema: { "translations": [ { "id": "<block id>", "translation": "<translated text>" } ] }
- For domain-specific technical terms, provide the localized translation followed immediately by the original term in parentheses — e.g. 注意力机制（attention mechanism）. Keep proper nouns unchanged unless a well-established localized form exists.
- Do NOT translate math or code blocks (they are not included in input).
- Content may contain inline HTML (e.g. <cite>, <a>, <em>). Keep every tag and ALL its attributes (href, data-ref, class, id) byte-for-byte unchanged; only translate the human-readable text between tags.
- Do not add, drop, or reorder any HTML tags.
- Return one entry per input block id."""

COMPLETE_ITEM_RE = re.compile(
    r'\{\s*"id"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"translation"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}'
)
PARTIAL_ITEM_RE = re.compile(
    r'\{\s*"id"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"translation"\s*:\s*"((?:[^"\\]|\\.)*)$'
)


def build_sample_blocks(target_chars: int) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []
    total = 0
    index = 0

    while total < target_chars:
        remaining = target_chars - total
        suffix = f" Block {index + 1}."
        unit = SAMPLE_PARAGRAPH + suffix
        content = unit if remaining >= len(unit) else unit[: max(remaining, 1)]
        blocks.append({"id": f"bench-block-{index + 1}", "content": content})
        total += len(content)
        index += 1

    return blocks


def decode_json_string(fragment: str) -> str:
    try:
        return json.loads(f'"{fragment}"')
    except json.JSONDecodeError:
        return bytes(fragment, "utf-8").decode("unicode_escape")


def extract_translation_updates(
    accumulated: str,
    completed_ids: set[str],
) -> list[tuple[str, str]]:
    updates: list[tuple[str, str]] = []

    for match in COMPLETE_ITEM_RE.finditer(accumulated):
        block_id = decode_json_string(match.group(1))
        translation = decode_json_string(match.group(2))
        if block_id in completed_ids:
            continue
        completed_ids.add(block_id)
        updates.append((block_id, translation))

    partial = PARTIAL_ITEM_RE.search(accumulated)
    if partial:
        block_id = decode_json_string(partial.group(1))
        translation = decode_json_string(partial.group(2))
        if block_id not in completed_ids and translation:
            updates.append((block_id, translation))

    return updates


def estimate_tokens(chars: int) -> int:
    return (chars + 3) // 4


def parse_sse_lines(buffer: str) -> tuple[list[str], str]:
    lines: list[str] = []
    while "\n" in buffer:
        line, buffer = buffer.split("\n", 1)
        line = line.rstrip("\r")
        if line.startswith("data: "):
            data = line[6:]
            if data and data != "[DONE]":
                lines.append(data)
    return lines, buffer


def openai_stream_chat(
    *,
    base_url: str,
    api_key: str,
    model: str,
    system: str,
    user_content: str,
) -> dict[str, object | None]:
    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "stream": True,
        "response_format": {"type": "json_object"},
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    started = time.perf_counter()
    time_to_response_ms: float | None = None
    ttft_content_ms: float | None = None
    ttft_translation_ms: float | None = None
    first_content = ""
    first_translation = ""
    accumulated = ""
    completed_ids: set[str] = set()

    with urllib.request.urlopen(request, timeout=300) as response:
        time_to_response_ms = (time.perf_counter() - started) * 1000
        buffer = ""

        while True:
            chunk = response.read(4096)
            if not chunk:
                break

            buffer += chunk.decode("utf-8", errors="replace")
            data_lines, buffer = parse_sse_lines(buffer)

            for data in data_lines:
                parsed = json.loads(data)
                delta = parsed.get("choices", [{}])[0].get("delta", {}).get("content")
                if not delta:
                    continue

                if ttft_content_ms is None:
                    ttft_content_ms = (time.perf_counter() - started) * 1000
                    first_content = delta[:80]

                accumulated += delta
                for _, translation in extract_translation_updates(accumulated, completed_ids):
                    if ttft_translation_ms is None and translation:
                        ttft_translation_ms = (time.perf_counter() - started) * 1000
                        first_translation = translation[:80]

    total_ms = (time.perf_counter() - started) * 1000

    return {
        "time_to_response_ms": time_to_response_ms,
        "ttft_content_ms": ttft_content_ms,
        "ttft_translation_ms": ttft_translation_ms,
        "total_ms": total_ms,
        "first_content": first_content,
        "first_translation": first_translation,
    }


def main() -> int:
    api_key = os.environ.get("LLM_API_KEY", "").strip()
    base_url = os.environ.get("LLM_BASE_URL", "").strip()
    model = os.environ.get("LLM_MODEL", "").strip()
    target_chars = int(os.environ.get("BENCH_INPUT_CHARS", str(INITIAL_MAX_CHUNK_CHARS)))

    if not api_key or not base_url or not model:
        print(
            "Missing env vars. Set LLM_API_KEY, LLM_BASE_URL, LLM_MODEL "
            "(optional: BENCH_INPUT_CHARS).",
            file=sys.stderr,
        )
        return 1

    blocks = build_sample_blocks(target_chars)
    user_content = json.dumps({"blocks": blocks}, ensure_ascii=False)
    input_chars = len(SYSTEM_PROMPT) + len(user_content)

    print(
        f"Running direct Python TTFT benchmark ({target_chars} user-message chars, model={model})"
    )

    try:
        metrics = openai_stream_chat(
            base_url=base_url,
            api_key=api_key,
            model=model,
            system=SYSTEM_PROMPT,
            user_content=user_content,
        )
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="replace")
        print(f"HTTP {err.code}: {body}", file=sys.stderr)
        return 1

    print("[direct Python]")
    print(f"  user chars: {len(user_content)}, system chars: {len(SYSTEM_PROMPT)}")
    print(f"  estimated input tokens: ~{estimate_tokens(input_chars)}")
    print(f"  time to HTTP response: {metrics['time_to_response_ms']:.1f} ms")
    print(f"  TTFT (first model content chunk): {metrics['ttft_content_ms']:.1f} ms")
    print(
        "  TTFT (first visible translation text): "
        f"{metrics['ttft_translation_ms']:.1f} ms"
        if metrics["ttft_translation_ms"] is not None
        else "  TTFT (first visible translation text): n/a"
    )
    print(f"  total stream time: {metrics['total_ms']:.1f} ms")
    if metrics["first_content"]:
        print(f"  first content: {json.dumps(metrics['first_content'])}")
    if metrics["first_translation"]:
        print(f"  first translation: {json.dumps(metrics['first_translation'])}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
