import {
  isSupportedImageMediaType,
  type ImageInput,
  type SupportedImageMediaType,
} from "@/core/agent/multimodal";

export type PendingImageAttachment = ImageInput & {
  id: string;
  previewUrl: string;
};

function normalizeMediaType(file: File): SupportedImageMediaType | null {
  if (isSupportedImageMediaType(file.type)) {
    return file.type;
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".png")) return "image/png";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "image/jpeg";
  if (lowerName.endsWith(".gif")) return "image/gif";
  if (lowerName.endsWith(".webp")) return "image/webp";
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read image file"));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

export function isImageFile(file: File): boolean {
  return normalizeMediaType(file) !== null;
}

export async function readImageFile(file: File): Promise<PendingImageAttachment> {
  const mediaType = normalizeMediaType(file);
  if (!mediaType) {
    throw new Error("Unsupported image type");
  }

  const data = await fileToBase64(file);
  return {
    id: crypto.randomUUID(),
    mediaType,
    data,
    name: file.name,
    previewUrl: URL.createObjectURL(file),
  };
}

export function releaseAttachmentPreview(attachment: PendingImageAttachment): void {
  URL.revokeObjectURL(attachment.previewUrl);
}

export function releaseAttachmentPreviews(attachments: PendingImageAttachment[]): void {
  for (const attachment of attachments) {
    releaseAttachmentPreview(attachment);
  }
}

export async function readImageFiles(files: File[]): Promise<PendingImageAttachment[]> {
  const attachments: PendingImageAttachment[] = [];
  for (const file of files) {
    if (!isImageFile(file)) {
      continue;
    }
    attachments.push(await readImageFile(file));
  }
  return attachments;
}

export function extractImageFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  if (dataTransfer.files.length > 0) {
    for (const file of dataTransfer.files) {
      if (isImageFile(file)) {
        files.push(file);
      }
    }
    return files;
  }

  for (const item of dataTransfer.items) {
    if (item.kind !== "file") {
      continue;
    }
    const file = item.getAsFile();
    if (file && isImageFile(file)) {
      files.push(file);
    }
  }
  return files;
}

export function extractImageFilesFromClipboard(
  clipboardData: DataTransfer | null,
): File[] {
  if (!clipboardData) {
    return [];
  }
  return extractImageFilesFromDataTransfer(clipboardData);
}
