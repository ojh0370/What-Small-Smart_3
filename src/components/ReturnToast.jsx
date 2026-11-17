import { Loader2 } from "lucide-react";
import { useRosbridge } from "../context/RosbridgeContext";

const HOME_ID = "0000"; // 복귀 위치 ID

// 로봇이 복귀(0000) 중일 때, 휴대폰 알림처럼 화면 맨 위 가운데에 띄우는 배너예요.
// 로봇 상태가 바뀌면(도착/실패) 저절로 사라져요.
export default function ReturnToast() {
  const { navStatus, navBookId } = useRosbridge();

  if (navStatus !== "navigating" || navBookId !== HOME_ID) return null;

  return (
    <div
      role="status"
      className="fixed top-4 left-1/2 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-xl animate-in fade-in slide-in-from-top-4"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm font-semibold">복귀중...</span>
    </div>
  );
}
