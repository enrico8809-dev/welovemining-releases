import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";

const LOGO_NAME = "company-logo";

/**
 * Lets the user pick a logo and copies it into the app's own document
 * directory. The URI the picker hands back points at a cache/gallery location
 * the OS is free to reclaim, so keeping a copy is what stops the logo quietly
 * vanishing off invoices weeks later.
 *
 * Returns the stored URI, or null if the user cancelled.
 */
export async function pickCompanyLogo(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("no-permission");

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const ext = guessExtension(asset.uri, asset.mimeType);
  const dest = new FileSystem.File(FileSystem.Paths.document, `${LOGO_NAME}.${ext}`);

  if (dest.exists) dest.delete();
  await new FileSystem.File(asset.uri).copy(dest);
  return dest.uri;
}

export function deleteCompanyLogo(uri: string): void {
  try {
    const file = new FileSystem.File(uri);
    if (file.exists) file.delete();
  } catch {
    // A logo that's already gone is the outcome we wanted anyway.
  }
}

/** The PDF template needs the image inline, since it has no file access. */
export function logoAsDataUri(uri: string): string | null {
  try {
    const file = new FileSystem.File(uri);
    if (!file.exists) return null;
    const base64 = file.base64Sync();
    const ext = guessExtension(uri);
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

function guessExtension(uri: string, mimeType?: string | null): string {
  if (mimeType?.includes("png")) return "png";
  if (mimeType?.includes("webp")) return "webp";
  if (mimeType?.includes("jpeg") || mimeType?.includes("jpg")) return "jpg";
  const match = /\.(png|jpe?g|webp)(\?|$)/i.exec(uri);
  if (match) return match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  return "jpg";
}
