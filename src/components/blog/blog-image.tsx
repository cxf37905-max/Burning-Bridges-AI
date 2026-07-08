'use client';

import Image from 'next/image';

interface BlogImageProps {
  src: string;
  alt: string;
  title?: string;
}

export default function BlogImage({ src, alt, title }: BlogImageProps) {
  return (
    <div className="relative w-full h-full bg-muted">
      <Image
        src={src}
        alt={alt}
        title={title || alt}
        className="object-cover transition-transform duration-300 hover:scale-105"
        fill
      />
    </div>
  );
}
