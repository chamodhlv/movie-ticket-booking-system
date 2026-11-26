import QRCode from "qrcode";

// Shared by the ticket page and the e-mail, so both show an identical QR code.
const OPTIONS = {
  // "M" = the code still scans if ~15% is scratched or blurred. (L is smaller but fragile,
  // H is sturdy but denser and harder for a phone screen to focus on.)
  errorCorrectionLevel: "M" as const,
  margin: 2, // the white border ("quiet zone"); scanners need it to find the code
  width: 320,
};

// A real PNG file in memory. The e-mail attaches this (a data: URL would be blocked by Gmail).
export function qrPngBuffer(text: string): Promise<Buffer> {
  return QRCode.toBuffer(text, { ...OPTIONS, type: "png" });
}

// The same PNG as text: "data:image/png;base64,...". The browser can show this directly in
// <img src="..."> with no extra request, which is perfect for the ticket page.
export function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, OPTIONS);
}
