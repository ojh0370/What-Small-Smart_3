import { useState, useRef, useCallback, useEffect } from "react";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "https://what-small-smart-3.onrender.com";

// ───────────────────────── 튜닝 값 ─────────────────────────
// 원리: 마이크에 가까운 목소리는 멀리 있는 소리보다 "훨씬 크게" 들어온다.
// 그래서 '주변 소음 크기 + 여유(dB)'를 문턱값으로 잡고, 그보다 큰 소리만 통과시킨다.
const CALIBRATE_MS = 400; // 시작 직후 주변 소음 크기를 재는 시간
const OPEN_MARGIN_DB = 12; // 소음보다 이만큼 커야 '내 목소리'로 인정 (소음이 계속 들어오면 ↑)
const HYSTERESIS_DB = 4; // 열릴 때/닫힐 때 문턱 차이 (떨림 방지)
const MIN_OPEN_DB = -50; // 너무 조용한 방에서도 이 값 미만은 무시
const HANGOVER_MS = 350; // 말 사이 짧은 쉼에도 게이트를 유지
const END_SILENCE_MS = 1000; // 말이 끝난 뒤 이만큼 조용하면 종료
const MIN_SPEECH_MS = 250; // 이보다 짧은 소리(기침, 문 닫는 소리)는 말로 보지 않음
const NO_SPEECH_TIMEOUT_MS = 6000; // 아무도 말 안 하면 종료
const MAX_RECORD_MS = 10000; // 최대 녹음 길이
const LOOKAHEAD_S = 0.12; // 게이트가 열리기 전 첫소리가 잘리지 않게 하는 지연
const TICK_MS = 20;
const DEBUG = false; // true면 콘솔에 레벨(dB)과 문턱값 출력 → 튜닝용

function pickMimeType() {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4", // iOS Safari
    "audio/ogg;codecs=opus",
  ];
  return candidates.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || "";
}

export function useVoiceSearch() {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const sessionRef = useRef(null);

  const supported =
    typeof window !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    !!window.MediaRecorder &&
    !!(window.AudioContext || window.webkitAudioContext);

  // 컴포넌트가 사라질 때 마이크/오디오 정리
  useEffect(() => () => sessionRef.current?.abort(), []);

  const start = useCallback(
    async (onResult) => {
      if (!supported) {
        setError("이 브라우저는 음성 녹음을 지원하지 않습니다. Chrome/Edge/Safari에서 열어주세요.");
        return;
      }
      if (sessionRef.current) return;
      setError(null);

      // 1) 마이크 열기 ─ 자동 음량 보정(AGC)은 반드시 끈다.
      //    AGC가 켜져 있으면 멀리서 들리는 작은 소리도 같은 크기로 키워 버려서
      //    '가까운 소리 vs 먼 소리'의 크기 차이가 사라진다.
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            noiseSuppression: true, // 에어컨/바람 같은 일정한 소음 제거
            echoCancellation: true,
            autoGainControl: false,
          },
        });
      } catch (err) {
        setError(
          err.name === "NotAllowedError"
            ? "마이크 권한이 거부되었어요. 브라우저 주소창 옆 마이크 아이콘에서 허용해주세요."
            : "마이크에 접근할 수 없어요. 기기 설정을 확인해주세요."
        );
        return;
      }

      // 2) 오디오 그래프:
      //    source ─┬─> analyser                       (크기 측정용, 지연 없음)
      //            └─> delay ─> gate(Gain) ─> dest    (녹음용, 지연 + 게이트)
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      try {
        await ctx.resume();
      } catch {}
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const delay = ctx.createDelay(1);
      delay.delayTime.value = LOOKAHEAD_S;
      const gate = ctx.createGain();
      gate.gain.value = 0;
      const dest = ctx.createMediaStreamDestination();
      source.connect(analyser);
      source.connect(delay);
      delay.connect(gate);
      gate.connect(dest);

      const mimeType = pickMimeType();
      let recorder;
      try {
        recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close();
        setError("녹음을 시작할 수 없어요.");
        return;
      }
      const chunks = [];
      recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);

      const buf = new Float32Array(analyser.fftSize);
      const readDb = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        return 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
      };

      const releaseAudio = () => {
        stream.getTracks().forEach((t) => t.stop());
        ctx.close().catch(() => {});
      };

      let timerId = null;
      let finished = false;

      const finish = (send, reason) => {
        if (finished) return;
        finished = true;
        clearInterval(timerId);
        setListening(false);

        recorder.onstop = async () => {
          releaseAudio();
          sessionRef.current = null;

          if (!send) {
            setError(
              reason === "no-speech"
                ? "목소리가 잘 들리지 않았어요. 마이크에 가까이 대고 다시 말씀해주세요."
                : null
            );
            return;
          }

          const type = recorder.mimeType || mimeType || "audio/webm";
          const blob = new Blob(chunks, { type });

          setProcessing(true);
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            const res = await fetch(`${API_BASE}/transcribe`, {
              method: "POST",
              headers: { "Content-Type": type },
              body: blob,
              signal: controller.signal,
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
            const data = await res.json();
            if (DEBUG) console.log("[음성] 인식 원문:", data.text, "→ 제목:", data.keyword);

            const keyword = (data.keyword || "").trim();
            if (!keyword) {
              setError("잘 알아듣지 못했어요. 마이크에 가까이 대고 다시 말씀해주세요.");
            } else {
              onResult(keyword);
            }
          } catch (err) {
            console.warn("음성 인식 실패:", err.message);
            setError("음성 인식에 실패했어요. 잠시 후 다시 시도해주세요.");
          } finally {
            setProcessing(false);
          }
        };

        if (recorder.state !== "inactive") recorder.stop();
        else recorder.onstop();
      };

      sessionRef.current = {
        abort: () => {
          if (finished) {
            return;
          }
          finished = true;
          clearInterval(timerId);
          try {
            if (recorder.state !== "inactive") recorder.stop();
          } catch {}
          releaseAudio();
          sessionRef.current = null;
        },
      };

      setListening(true);
      recorder.start();

      // 3) 측정 루프: 처음 CALIBRATE_MS 동안 주변 소음 크기 측정 → 이후 게이트 제어
      const t0 = performance.now();
      const floorSamples = [];
      let openDb = null;
      let closeDb = null;
      let gateOpen = false;
      let lastLoud = t0;
      let loudMs = 0;
      let lastTick = t0;
      let recStart = null;

      timerId = setInterval(() => {
        const now = performance.now();
        const dt = now - lastTick;
        lastTick = now;
        const db = readDb();

        // 3-1) 보정 구간: 주변 소음의 '바닥' 크기를 구한다 (하위 30% 값 → 순간적인 큰 소리에 둔감)
        if (openDb === null) {
          floorSamples.push(db);
          if (now - t0 >= CALIBRATE_MS) {
            const sorted = [...floorSamples].sort((a, b) => a - b);
            const floor = sorted[Math.floor(sorted.length * 0.3)];
            openDb = Math.max(floor + OPEN_MARGIN_DB, MIN_OPEN_DB);
            closeDb = openDb - HYSTERESIS_DB;
            recStart = now;
            lastLoud = now;
            if (DEBUG) console.log(`[음성] 소음 바닥 ${floor.toFixed(1)} dB → 문턱 ${openDb.toFixed(1)} dB`);
          }
          return;
        }

        // 3-2) 게이트: 문턱보다 큰 소리(= 가까이서 말하는 소리)만 통과
        if (db > (gateOpen ? closeDb : openDb)) {
          lastLoud = now;
          if (!gateOpen) {
            gateOpen = true;
            gate.gain.setTargetAtTime(1, ctx.currentTime, 0.005);
          }
          if (db > openDb) loudMs += dt;
        } else if (gateOpen && now - lastLoud > HANGOVER_MS) {
          gateOpen = false;
          gate.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
        }

        if (DEBUG) console.log(`[음성] ${db.toFixed(1)} dB ${gateOpen ? "▮ OPEN" : "·"}`);

        // 3-3) 종료 조건
        const spoke = loudMs >= MIN_SPEECH_MS;
        if (spoke && now - lastLoud > END_SILENCE_MS) return finish(true);
        if (now - recStart > MAX_RECORD_MS) return finish(spoke, spoke ? "max" : "no-speech");
        if (!spoke && now - recStart > NO_SPEECH_TIMEOUT_MS) return finish(false, "no-speech");
      }, TICK_MS);
    },
    [supported]
  );

  return { listening, processing, error, supported, start };
}