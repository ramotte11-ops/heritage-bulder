import { describe, expect, it } from "vitest";
import { MAX_MEDIA_BYTES } from "@/config/media";
import { PHOTO_INPUT_MAX_BYTES } from "@/config/photo-profiles";
import { precheckHeroPhotoFile, precheckPhotoInput } from "./precheck-upload";

describe("precheckHeroPhotoFile — Mission 033 section 8, a UX convenience only", () => {
  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s under the size limit", (type) => {
    expect(precheckHeroPhotoFile({ type, size: 1024 })).toBeNull();
  });

  it("accepts a file exactly at the size limit", () => {
    expect(precheckHeroPhotoFile({ type: "image/jpeg", size: MAX_MEDIA_BYTES })).toBeNull();
  });

  it.each(["image/heic", "image/heif", "image/avif", "image/gif", "image/svg+xml", "video/mp4", "application/pdf"])(
    "refuses %s as unsupported_format",
    (type) => {
      expect(precheckHeroPhotoFile({ type, size: 1024 })).toBe("unsupported_format");
    },
  );

  it("refuses an oversized file as file_too_large", () => {
    expect(precheckHeroPhotoFile({ type: "image/jpeg", size: MAX_MEDIA_BYTES + 1 })).toBe("file_too_large");
  });

  it("checks the format before the size — an unsupported format is never reported as too large", () => {
    expect(precheckHeroPhotoFile({ type: "image/gif", size: MAX_MEDIA_BYTES + 1 })).toBe(
      "unsupported_format",
    );
  });

  it("refuses an empty/unset type string", () => {
    expect(precheckHeroPhotoFile({ type: "", size: 1024 })).toBe("unsupported_format");
  });
});

describe("precheckPhotoInput — Optimisation photographique V1, the CHOSEN photo before its preparation", () => {
  it("accepts a heavy phone photo above the server limit: it is prepared, never sent as is", () => {
    expect(precheckPhotoInput({ type: "image/jpeg", size: MAX_MEDIA_BYTES + 1 })).toBeNull();
    expect(precheckPhotoInput({ type: "image/jpeg", size: PHOTO_INPUT_MAX_BYTES })).toBeNull();
  });

  it("refuses what a browser cannot reasonably prepare, and the formats the server does not admit", () => {
    expect(precheckPhotoInput({ type: "image/jpeg", size: PHOTO_INPUT_MAX_BYTES + 1 })).toBe("file_too_large");
    expect(precheckPhotoInput({ type: "image/heic", size: 1024 })).toBe("unsupported_format");
    expect(precheckPhotoInput({ type: "", size: 1024 })).toBe("unsupported_format");
  });
});
