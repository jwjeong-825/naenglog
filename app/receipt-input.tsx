'use client';
import { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
export function ReceiptInput({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (file: File) => void;
}) {
  const camera = useRef<HTMLInputElement>(null),
    upload = useRef<HTMLInputElement>(null);
  const selected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onSelect(file);
  };
  return (
    <div className="receipt-input">
      <div className="two-cols">
        <button
          type="button"
          className="primary"
          disabled={disabled}
          onClick={() => camera.current?.click()}
        >
          <Camera size={20} /> 영수증 촬영하기
        </button>
        <button
          type="button"
          className="secondary"
          disabled={disabled}
          onClick={() => upload.current?.click()}
        >
          <Upload size={20} /> 사진 업로드하기
        </button>
      </div>
      <input
        ref={camera}
        hidden
        aria-label="영수증 카메라 입력"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={disabled}
        onChange={selected}
      />
      <input
        ref={upload}
        hidden
        aria-label="구매내역 사진 파일 입력"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={disabled}
        onChange={selected}
      />
      <p className="footnote">
        JPG·JPEG·PNG·WEBP · 최대 5MB. 촬영은 지원 기기에서 후면 카메라를
        요청해요. 카메라가 열리지 않으면 사진 업로드를 이용해주세요.
      </p>
    </div>
  );
}
