import exifr from "exifr";
import sharp from "sharp";
import { civilDate, type PhotoLocation } from "@akai/shared";

export const emptyPhotoLocation = (): PhotoLocation => ({
  latitude: null,
  longitude: null,
  capturedOn: null,
  locationSource: null,
});
export function validatePhotoMetadata(
  raw: Record<string, unknown> | undefined,
): PhotoLocation {
  const result = emptyPhotoLocation();
  if (!raw) return result;
  const { latitude, longitude, DateTimeOriginal } = raw;
  if (
    typeof latitude === "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude === "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  ) {
    result.latitude = latitude;
    result.longitude = longitude;
    result.locationSource = "exif";
  }
  // EXIF is a camera-local civil date. Never shift it through the server timezone.
  if (typeof DateTimeOriginal === "string") {
    const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
      DateTimeOriginal.trim(),
    );
    if (
      match &&
      Number(match[4]) < 24 &&
      Number(match[5]) < 60 &&
      Number(match[6]) < 60
    ) {
      const date = `${match[1]}-${match[2]}-${match[3]}`;
      if (civilDate.safeParse(date).success) result.capturedOn = date;
    }
  }
  return result;
}

export async function extractPhotoMetadata(
  buffer: Buffer,
): Promise<PhotoLocation> {
  try {
    // Sharp extracts the same TIFF block from JPEG, PNG and WebP. Parse only that
    // block, never remote URLs, XML, maker notes or arbitrary metadata fields.
    const { exif } = await sharp(buffer, {
      limitInputPixels: 40000000,
    }).metadata();
    if (!exif) return emptyPhotoLocation();
    const tiff = exif.subarray(0, 6).equals(Buffer.from("Exif\0\0"))
      ? exif.subarray(6)
      : exif;
    const raw = (await exifr.parse(tiff, {
      pick: [
        "GPSLatitude",
        "GPSLatitudeRef",
        "GPSLongitude",
        "GPSLongitudeRef",
        "DateTimeOriginal",
      ],
      reviveValues: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
    })) as Record<string, unknown> | undefined;
    return validatePhotoMetadata(raw);
  } catch {
    // Bad or absent metadata must not reject a photograph already validated by Sharp.
    return emptyPhotoLocation();
  }
}
