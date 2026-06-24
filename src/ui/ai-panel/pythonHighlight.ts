export type PythonTokenKind =
  | "plain"
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "function"
  | "builtin"
  | "decorator"
  | "operator";

export type PythonToken = {
  kind: PythonTokenKind;
  text: string;
};

const KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

const BUILTINS = new Set([
  "ArithmeticError",
  "AssertionError",
  "AttributeError",
  "BaseException",
  "BlockingIOError",
  "BrokenPipeError",
  "BufferError",
  "BytesWarning",
  "ChildProcessError",
  "ConnectionAbortedError",
  "ConnectionError",
  "ConnectionRefusedError",
  "ConnectionResetError",
  "DeprecationWarning",
  "EOFError",
  "Ellipsis",
  "EnvironmentError",
  "Exception",
  "FileExistsError",
  "FileNotFoundError",
  "FloatingPointError",
  "FutureWarning",
  "GeneratorExit",
  "IOError",
  "ImportError",
  "ImportWarning",
  "IndentationError",
  "IndexError",
  "InterruptedError",
  "IsADirectoryError",
  "KeyError",
  "KeyboardInterrupt",
  "LookupError",
  "MemoryError",
  "ModuleNotFoundError",
  "NameError",
  "NotADirectoryError",
  "NotImplementedError",
  "OSError",
  "OverflowError",
  "PendingDeprecationWarning",
  "PermissionError",
  "ProcessLookupError",
  "RecursionError",
  "ReferenceError",
  "ResourceWarning",
  "RuntimeError",
  "RuntimeWarning",
  "StopAsyncIteration",
  "StopIteration",
  "SyntaxError",
  "SyntaxWarning",
  "SystemError",
  "SystemExit",
  "TabError",
  "TimeoutError",
  "TypeError",
  "UnboundLocalError",
  "UnicodeDecodeError",
  "UnicodeEncodeError",
  "UnicodeError",
  "UnicodeTranslateError",
  "UnicodeWarning",
  "UserWarning",
  "ValueError",
  "Warning",
  "ZeroDivisionError",
  "abs",
  "all",
  "any",
  "bool",
  "bytes",
  "dict",
  "enumerate",
  "filter",
  "float",
  "int",
  "len",
  "list",
  "map",
  "max",
  "min",
  "open",
  "print",
  "range",
  "repr",
  "reversed",
  "round",
  "set",
  "sorted",
  "str",
  "sum",
  "tuple",
  "type",
  "zip",
]);

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function readString(
  source: string,
  start: number,
  quote: "'" | '"',
): { text: string; next: number } {
  let text = quote;
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i]!;
    text += ch;
    if (ch === "\\") {
      if (i + 1 < source.length) {
        text += source[i + 1]!;
        i += 2;
        continue;
      }
      break;
    }
    if (ch === quote) {
      return { text, next: i + 1 };
    }
    i += 1;
  }
  return { text, next: i };
}

function readTripleString(
  source: string,
  start: number,
  quote: "'" | '"',
): { text: string; next: number } {
  const opener = quote.repeat(3);
  let text = opener;
  let i = start + 3;
  while (i < source.length) {
    const ch = source[i]!;
    text += ch;
    if (ch === quote) {
      const candidate = source.slice(i, i + 3);
      if (candidate === opener) {
        text += quote.repeat(2);
        return { text, next: i + 3 };
      }
    }
    i += 1;
  }
  return { text, next: i };
}

function readNumber(source: string, start: number): { text: string; next: number } {
  let i = start;
  while (i < source.length && /[0-9._xXa-fA-FjJ]/.test(source[i]!)) {
    i += 1;
  }
  return { text: source.slice(start, i), next: i };
}

function classifyIdentifier(
  text: string,
  nextNonSpace: string | undefined,
): PythonTokenKind {
  if (KEYWORDS.has(text)) {
    return "keyword";
  }
  if (BUILTINS.has(text)) {
    return "builtin";
  }
  if (nextNonSpace === "(") {
    return "function";
  }
  return "plain";
}

function pushWhitespace(tokens: PythonToken[], source: string, start: number, end: number) {
  if (end > start) {
    tokens.push({ kind: "plain", text: source.slice(start, end) });
  }
}

export function tokenizePython(source: string): PythonToken[] {
  const tokens: PythonToken[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === "#") {
      const start = i;
      while (i < source.length && source[i] !== "\n") {
        i += 1;
      }
      tokens.push({ kind: "comment", text: source.slice(start, i) });
      continue;
    }

    if (ch === "@" && isIdentifierStart(source[i + 1] ?? "")) {
      const start = i;
      i += 1;
      while (i < source.length && isIdentifierPart(source[i]!)) {
        i += 1;
      }
      tokens.push({ kind: "decorator", text: source.slice(start, i) });
      continue;
    }

    if (ch === "'" || ch === '"') {
      const triple = source.slice(i, i + 3);
      if (triple === `${ch.repeat(3)}`) {
        const { text, next } = readTripleString(source, i, ch);
        tokens.push({ kind: "string", text });
        i = next;
        continue;
      }
      const { text, next } = readString(source, i, ch);
      tokens.push({ kind: "string", text });
      i = next;
      continue;
    }

    if (/[0-9]/.test(ch)) {
      const { text, next } = readNumber(source, i);
      tokens.push({ kind: "number", text });
      i = next;
      continue;
    }

    if (isIdentifierStart(ch)) {
      const start = i;
      i += 1;
      while (i < source.length && isIdentifierPart(source[i]!)) {
        i += 1;
      }
      const text = source.slice(start, i);
      let j = i;
      while (j < source.length && /\s/.test(source[j]!)) {
        j += 1;
      }
      tokens.push({
        kind: classifyIdentifier(text, source[j]),
        text,
      });
      continue;
    }

    if (/[+\-*/%=<>!&|^~:;,.\[\]{}()]/.test(ch)) {
      tokens.push({ kind: "operator", text: ch });
      i += 1;
      continue;
    }

    const wsStart = i;
    while (i < source.length && /\s/.test(source[i]!)) {
      i += 1;
    }
    pushWhitespace(tokens, source, wsStart, i);
  }

  return tokens;
}

export const PYTHON_TOKEN_CLASS: Record<PythonTokenKind, string> = {
  plain: "vscode-py-plain",
  keyword: "vscode-py-keyword",
  string: "vscode-py-string",
  comment: "vscode-py-comment",
  number: "vscode-py-number",
  function: "vscode-py-function",
  builtin: "vscode-py-builtin",
  decorator: "vscode-py-decorator",
  operator: "vscode-py-operator",
};
