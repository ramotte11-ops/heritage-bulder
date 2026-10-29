"use client";

import { useEffect, useRef, type ImgHTMLAttributes } from "react";

export interface LocalBlobImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  alt: string;
  blob: Blob;
}

/** Client-only object URL ownership shared by guest Hero and future local media screens. */
export function LocalBlobImage({ alt, blob, ...props }: LocalBlobImageProps) {
  const imageRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const displayUrl = URL.createObjectURL(blob);
    const image = imageRef.current;
    if (image !== null) image.src = displayUrl;
    return () => URL.revokeObjectURL(displayUrl);
  }, [blob]);

  // The empty mount value is identical during SSR and hydration. The effect
  // installs the client-only blob URL immediately afterward.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imageRef} alt={alt} {...props} />;
}
