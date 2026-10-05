import type { MessageKind } from "@prisma/client";
export const mediaMaxBytes = 8 * 1024 * 1024;
export const mediaKinds = ["IMAGE", "AUDIO", "VIDEO", "DOCUMENT"] as const;
export class MessageMediaUnavailable extends Error {
  constructor(readonly code: "UNSUPPORTED_MEDIA" | "MEDIA_TOO_LARGE" | "INVALID_MEDIA" | "MEDIA_UNAVAILABLE") { super("Arquivo indisponível ou fora dos formatos suportados."); }
}
export type MediaResult = { bytes: Buffer; mimeType: string; extension: string };
export interface MessageMediaProvider { getMessageMedia(instanceName: string, key: { id: string; remoteJid: string; fromMe: boolean }, kind: MessageKind): Promise<MediaResult>; }

export function validateMedia(kind: MessageKind, mimeType: string, bytes: Buffer): MediaResult {
  if (!bytes.length) throw new MessageMediaUnavailable("INVALID_MEDIA");
  if (bytes.length > mediaMaxBytes) throw new MessageMediaUnavailable("MEDIA_TOO_LARGE");
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  const starts = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const at = (value: string, position = 0) => bytes.subarray(position, position + value.length).toString("ascii") === value;
  let extension: string | undefined;
  if (kind === "IMAGE") {
    if (mime === "image/png" && starts([137, 80, 78, 71, 13, 10, 26, 10])) extension = "png";
    if (mime === "image/jpeg" && starts([255, 216, 255])) extension = "jpg";
    if (mime === "image/webp" && at("RIFF") && at("WEBP", 8)) extension = "webp";
  }
  if (kind === "DOCUMENT" && mime === "application/pdf" && at("%PDF-")) extension = "pdf";
  if (kind === "AUDIO") {
    if (mime === "audio/ogg" && at("OggS")) extension = "ogg";
    if (["audio/wav", "audio/x-wav"].includes(mime) && at("RIFF") && at("WAVE", 8)) extension = "wav";
    if (mime === "audio/mpeg" && (at("ID3") || (bytes[0] === 255 && (bytes[1] & 224) === 224))) extension = "mp3";
    if (mime === "audio/mp4" && at("ftyp", 4)) extension = "m4a";
  }
  if (kind === "VIDEO" && mime === "video/mp4" && at("ftyp", 4)) extension = "mp4";
  if (!extension) throw new MessageMediaUnavailable("UNSUPPORTED_MEDIA");
  return { bytes, mimeType: mime, extension };
}
