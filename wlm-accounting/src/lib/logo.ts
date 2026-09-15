import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * The logo is stored as a resized data URI rather than a file.
 *
 * A file path is meaningless on any other device, so a file-based logo can't
 * sync — and it also has a lifecycle to manage (the OS reclaiming a cache
 * directory, orphans left behind when the logo changes). A data URI has
 * neither problem: it travels with settings, renders directly in <Image> and in
 * the PDF, and there's nothing to clean up.
 *
 * The trade is size, which is why the image is resized before encoding. A
 * 600px-wide logo is ample for a letterhead that prints it around 220px, and
 * lands around 40–80KB rather than the several hundred a camera-resolution
 * upload would.
 */

const MAX_WIDTH = 600;

/** Refuse anything that would bloat every settings sync. */
export const MAX_LOGO_BYTES = 400 * 1024;

export class LogoTooLargeError extends Error {
  constructor() {
    super("That image is too detailed to store. Try a simpler or smaller logo.");
  }
}

export class LogoPermissionError extends Error {
  constructor() {
    super("Allow photo access to pick a logo.");
  }
}

/**
 * Prompts for an image and returns it as a data URI, or null if cancelled.
 */
export async function pickCompanyLogo(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new LogoPermissionError();

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    quality: 1, // resizing below does the compression; don't degrade twice
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];

  // PNG keeps a transparent background, which most logos rely on to sit on a
  // white letterhead without a visible box around them.
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width && asset.width > MAX_WIDTH) {
    context.resize({ width: MAX_WIDTH });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.PNG, base64: true });

  if (!saved.base64) throw new LogoTooLargeError();

  const dataUri = `data:image/png;base64,${saved.base64}`;
  if (dataUri.length > MAX_LOGO_BYTES) throw new LogoTooLargeError();
  return dataUri;
}

export function isDataUri(value: string): boolean {
  return typeof value === "string" && value.startsWith("data:image/");
}

/** Rough byte size of a stored logo, for showing the user what it costs. */
export function logoSizeKb(dataUri: string): number {
  if (!dataUri) return 0;
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  return Math.round((base64.length * 3) / 4 / 1024);
}
