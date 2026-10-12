import Image, { type ImageProps } from 'next/image';

/**
 * 使用Google官方彩色图标，保持原始颜色与比例。
 * 来源：https://developers.google.com/identity/branding-guidelines
 */
export function GoogleIcon(
  props: Omit<ImageProps, 'src' | 'alt' | 'width' | 'height'>
) {
  return (
    <Image
      src="/studio/google-g.png"
      alt=""
      width={200}
      height={204}
      {...props}
    />
  );
}
