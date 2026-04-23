import { useMemo, useState } from "react";

type BrandLogoProps = {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
};

const LOGO_SRC = "/branding/Logo.png";
const LOGO_FALLBACK_SRC = "/branding/logo-mark.svg";

export function BrandLogo({ className, alt = "Lingowatch logo", width = 72, height = 72 }: BrandLogoProps) {
  const [attempt, setAttempt] = useState(0);

  const src = useMemo(() => {
    if (attempt === 0) return LOGO_SRC;
    if (attempt === 1) return `${LOGO_SRC}?reload=${Date.now()}`;
    return LOGO_FALLBACK_SRC;
  }, [attempt]);

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      className={className}
      onError={() => setAttempt((current) => Math.min(current + 1, 2))}
    />
  );
}
