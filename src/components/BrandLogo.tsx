type BrandLogoProps = {
  className?: string;
  alt?: string;
  width?: number;
  height?: number;
};

export function BrandLogo({ className, alt = "Lingowatch logo", width = 72, height = 72 }: BrandLogoProps) {
  return (
    <img
      src="/Logo.png"
      alt={alt}
      width={width}
      height={height}
      decoding="sync"
      loading="eager"
      className={className}
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/logo-mark.svg"; }}
    />
  );
}
