export function countTranslationTextLength(html: string): number {
  return html.replace(/<[^>]+>/g, "").length;
}

export function sliceTranslationToTextLength(html: string, textCharCount: number): string {
  if (textCharCount <= 0) {
    return "";
  }

  let textSeen = 0;
  let index = 0;
  let result = "";

  while (index < html.length && textSeen < textCharCount) {
    if (html[index] === "<") {
      const tagEnd = html.indexOf(">", index);
      if (tagEnd === -1) {
        break;
      }

      const contentStart = tagEnd + 1;
      const nextTag = html.indexOf("<", contentStart);
      const contentEnd = nextTag === -1 ? html.length : nextTag;
      const textContent = html.slice(contentStart, contentEnd);

      if (textSeen + textContent.length > textCharCount) {
        const take = textCharCount - textSeen;
        if (take > 0) {
          result += html.slice(index, tagEnd + 1);
          result += textContent.slice(0, take);
        }
        break;
      }

      result += html.slice(index, contentEnd);
      textSeen += textContent.length;
      index = contentEnd;
      continue;
    }

    const nextTag = html.indexOf("<", index);
    const textEnd = nextTag === -1 ? html.length : nextTag;
    const text = html.slice(index, textEnd);

    if (textSeen + text.length > textCharCount) {
      result += text.slice(0, textCharCount - textSeen);
      break;
    }

    result += text;
    textSeen += text.length;
    index = textEnd;
  }

  return result;
}

export function computeRevealStep(backlog: number, streamComplete: boolean): number {
  if (backlog <= 0) {
    return 0;
  }

  // 按 backlog 比例放量，积压越多放得越快，避免肉眼"挤牙膏"。
  const proportional = Math.ceil(backlog / 5);

  if (streamComplete) {
    return Math.min(backlog, Math.max(16, proportional * 2));
  }
  return Math.min(backlog, Math.max(4, proportional));
}
