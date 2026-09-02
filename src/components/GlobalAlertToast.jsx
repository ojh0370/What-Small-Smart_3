import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { useAlertSocket } from "../hooks/useAlertSocket";

// 어느 페이지에 있든(책 검색 중이어도) 추종자 이탈 경고를 놓치지 않도록 화면 상단에 띄우는 전역 배너
// 도서관 환경이므로 소리는 재생하지 않고 화면 경고만 표시한다.
export default function GlobalAlertToast() {
  const { latestAlert, alertActive } = useAlertSocket();
  const lastSeenAt = useRef(null);

  useEffect(() => {
    if (!latestAlert?.createdAt) return;
    if (lastSeenAt.current === latestAlert.createdAt) return;
    lastSeenAt.current = latestAlert.createdAt;
  }, [latestAlert]);

  if (!alertActive || !latestAlert) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-red-600 text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-4">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span className="text-sm font-semibold">
        거리가 멀어졌어요! 로봇을 따라와주세요 🙂
      </span>
    </div>
  );
}