function decodeJsonStringFragment(source: string, start: number): string {
  let result = "";
  let i = start;

  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      if (i + 1 >= source.length) {
        break;
      }
      const next = source[i + 1]!;
      switch (next) {
        case '"':
          result += '"';
          break;
        case "\\":
          result += "\\";
          break;
        case "/":
          result += "/";
          break;
        case "b":
          result += "\b";
          break;
        case "f":
          result += "\f";
          break;
        case "n":
          result += "\n";
          break;
        case "r":
          result += "\r";
          break;
        case "t":
          result += "\t";
          break;
        case "u": {
          const hex = source.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) {
            result += String.fromCharCode(Number.parseInt(hex, 16));
            i += 4;
          } else {
            return result;
          }
          break;
        }
        default:
          result += next;
      }
      i += 2;
      continue;
    }
    if (ch === '"') {
      break;
    }
    result += ch;
    i += 1;
  }

  return result;
}

export function extractStreamingPythonCode(partialJson: string): string {
  const match = partialJson.match(/"code"\s*:\s*"/);
  if (!match || match.index === undefined) {
    return "";
  }

  const valueStart = match.index + match[0].length;
  return decodeJsonStringFragment(partialJson, valueStart);
}
