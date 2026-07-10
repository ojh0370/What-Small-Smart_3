import { useState, useRef, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://what-small-smart-3.onrender.com";
const TRAILING_REQUEST_PATTERN = /\s?(찾아줘|검색해줘|알려줘|보여줘)[.!?~]*$/;

export function useVoiceSearch({ lang = "ko-KR" } = {}) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const retriedRef = useRef(false);

  const supported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  const runRecognition = useCallback(
    (onResult) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SR();
      recognition.lang = lang;
      recognition.interimResults = false;
      recognition.continuous = false;

      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript.trim();
        setListening(false);
        if (!transcript) return;

        const quickKeyword = transcript.replace(TRAILING_REQUEST_PATTERN, "").trim();
        const isShort = quickKeyword.split(/\s+/).length <= 2;

        if (isShort) {
          onResult(quickKeyword);
          return;
        }

        setProcessing(true);
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(`${API_BASE}/extract-keyword`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: transcript }),
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
          const data = await res.json();
          onResult((data.keyword || quickKeyword).trim());
        } catch (err) {
          console.warn("키워드 추출 실패, 원문 폴백:", err.message);
          onResult(quickKeyword);
        } finally {
          setProcessing(false);
        }
      };

      recognition.onerror = (event) => {
        // no-speech는 첫 시도에서 흔히 발생 (마이크 초기화 지연) → 1회 자동 재시도
        if (event.error === "no-speech" && !retriedRef.current) {
          retriedRef.current = true;
          try {
            recognition.start();
            return; // 에러 상태로 안 내려가고 재시도
          } catch {
            // 재시도 실패 시 아래로 폴스루
          }
        }

        setListening(false);
        retriedRef.current = false;

        const messages = {
          "no-speech": "음성이 감지되지 않았어요. 마이크에 가까이 대고 다시 눌러 바로 말씀해주세요.",
          "not-allowed": "마이크 권한이 차단되어 있어요. 브라우저 설정에서 마이크 권한을 허용해주세요.",
          "audio-capture": "마이크를 찾을 수 없어요. 기기의 마이크 연결을 확인해주세요.",
          network: "네트워크 오류로 음성 인식에 실패했어요. 인터넷 연결을 확인해주세요.",
        };
        setError(messages[event.error] || "음성 인식 중 오류가 발생했어요.");
      };

      recognition.onend = () => setListening(false);

      recognition.start();
    },
    [lang]
  );

  const start = useCallback(
    async (onResult) => {
      if (!supported) {
        setError("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome/Edge/Safari 앱에서 직접 열어주세요.");
        return;
      }

      setError(null);
      retriedRef.current = false;

      // 마이크 권한을 recognition.start() 전에 명시적으로 확인
      // → 권한 팝업에 응답하는 동안 no-speech 타이머가 낭비되는 것을 방지
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop()); // 확인만 하고 바로 해제
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "마이크 권한이 거부되었어요. 브라우저 주소창 옆 마이크 아이콘에서 허용해주세요."
            : "마이크에 접근할 수 없어요. 기기 설정을 확인해주세요."
        );
        return;
      }

      setListening(true);
      runRecognition(onResult);
    },
    [supported, runRecognition]
  );

  return { listening, processing, error, supported, start };
}