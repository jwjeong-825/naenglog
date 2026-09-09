export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export type ImageInput = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  base64: string;
};
export function validateImage(value: unknown): asserts value is ImageInput {
  if (!value || typeof value !== 'object')
    throw new Error('이미지를 선택해주세요.');
  const v = value as ImageInput;
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(v.mimeType) ||
    typeof v.base64 !== 'string' ||
    v.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      v.base64,
    )
  )
    throw new Error('5MB 이하 JPG, PNG, WebP 이미지만 사용할 수 있어요.');
  const b = atob(v.base64);
  if (!b.length || b.length > MAX_IMAGE_BYTES)
    throw new Error('이미지 크기를 확인해주세요.');
  const codes = (xs: number[]) => xs.every((n, i) => b.charCodeAt(i) === n);
  if (
    !(v.mimeType === 'image/png'
      ? codes([137, 80, 78, 71, 13, 10, 26, 10])
      : v.mimeType === 'image/jpeg'
        ? codes([255, 216, 255])
        : b.startsWith('RIFF') && b.slice(8, 12) === 'WEBP')
  )
    throw new Error('이미지 내용과 파일 형식이 일치하지 않아요.');
}
export async function encodeImage(file: File): Promise<ImageInput> {
  if (file.size > MAX_IMAGE_BYTES)
    throw new Error('이미지는 5MB 이하여야 해요.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const image = { mimeType: file.type, base64: btoa(binary) };
  validateImage(image);
  return image;
}
