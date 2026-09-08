import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '냉로그 · 오늘의 냉장고',
  description:
    '구매 기록부터 오늘 먹을 재료까지. 모의 AI와 함께 체험하는 냉장고 관리.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
