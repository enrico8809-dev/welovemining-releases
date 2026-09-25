import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// The document markup lives in pdfHtml, which has no Expo imports and so is
// shared with the desktop app. Re-exported so callers need only one import.
export * from "./pdfHtml";

/** Renders HTML to a PDF and opens the share sheet. Returns the file URI. */
export async function sharePdf(html: string, filename: string): Promise<string> {
  const { uri } = await Print.printToFileAsync({ html, base64: false });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: filename,
      UTI: "com.adobe.pdf",
    });
  }
  return uri;
}
