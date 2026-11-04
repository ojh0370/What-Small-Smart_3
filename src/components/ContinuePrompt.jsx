import { useEffect, useRef, useState } from "react";
import { CheckCircle } from "lucide-react";

const TOTAL_SECONDS = 15; // 자동 복귀까지 기다리는 시간

export default function ContinuePrompt({ onContinue, onTimeout }) {
  const [remaining, setRemaining] = useState(TOTAL_SECONDS);
  const finished = useRef(false); // 계속 이용/시간 종료 중 한 번만 처리하기 위한 표시

  // 부모가 다시 그려져도 항상 최신 함수를 부르도록 ref에 보관
  const onTimeoutRef = useRef(onTimeout);
  const onContinueRef = useRef(onContinue);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
    onContinueRef.current = onContinue;
  });

  useEffect(() => {
    // 1초씩 빼는 대신 "끝나는 시각"과 지금 시각을 비교해서 남은 초를 계산해요.
    // (탭이 잠깐 멈춰도 시간이 밀리지 않아요)
    const endAt = Date.now() + TOTAL_SECONDS * 1000;
    const id = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0 && !finished.current) {
        finished.current = true;
        clearInterval(id);
        onTimeoutRef.current(); // 복귀 명령은 여기서 딱 한 번만 나가요
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  const handleContinue = () => {
    if (finished.current) return;
    finished.current = true;
    onContinueRef.current();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="continue-title"
        className="relative w-full max-w-sm rounded-3xl bg-card p-7 text-center shadow-2xl animate-in fade-in zoom-in-95"
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-50">
          <CheckCircle className="h-7 w-7 text-green-600" />
        </div>

        <h2 id="continue-title" className="text-xl font-bold text-foreground">
          계속 이용하시겠습니까?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">책 위치에 도착했어요</p>

        <div className="my-6">
          <p className="text-5xl font-bold tabular-nums text-foreground">{remaining}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            초 뒤에 로봇이 자동으로 복귀해요
          </p>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent-gold transition-[width] duration-1000 ease-linear"
              style={{ width: `${(remaining / TOTAL_SECONDS) * 100}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="w-full rounded-2xl bg-primary py-4 text-sm font-bold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
        >
          계속 이용
        </button>
      </div>
    </div>
  );
}
