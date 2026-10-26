
import { useState } from "react";
import { useRosbridge } from "../hooks/useRosbridge";

export default function AdminRobot() {
  const {
    connStatus,
    robotConnected,
    navStatus,
    navBookId,
    sendBookRequest,
    resetNavStatus,
  } = useRosbridge();

  const [error, setError] = useState("");

  const handleReturnHome = () => {
    if (!robotConnected || connStatus !== "connected") {
      setError("로봇 연결 상태를 확인해주세요.");
      return;
    }

    if (navStatus === "navigating" || navStatus === "busy") {
      setError("로봇이 이미 이동 중입니다.");
      return;
    }

    if (!window.confirm("로봇을 복귀 위치로 이동할까요?")) {
      return;
    }

    try {
      setError("");
      resetNavStatus();
      sendBookRequest("HOME");
    } catch (e) {
      setError(e.message || "복귀 명령 전송에 실패했습니다.");
    }
  };

  return (
    <main className="min-h-screen p-6">
      <h1 className="text-2xl font-bold mb-4">
        로봇 관리
      </h1>

      <p className="mb-4">
        로봇 연결: {robotConnected ? "연결됨" : "연결 안 됨"}
      </p>

      <button
        onClick={handleReturnHome}
        disabled={
          !robotConnected ||
          navStatus === "navigating" ||
          navStatus === "busy"
        }
        className="w-full rounded-xl bg-blue-600 px-5 py-4
          font-bold text-white disabled:opacity-50"
      >
        {navStatus === "navigating" && navBookId === "HOME"
          ? "복귀 중..."
          : "홈으로 복귀"}
      </button>

      {navBookId === "HOME" && (
        <p className="mt-4">복귀 상태: {navStatus}</p>
      )}

      {error && (
        <p className="mt-4 text-red-600">{error}</p>
      )}
    </main>
  );
}
