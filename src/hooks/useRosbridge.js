import { useState, useEffect, useRef, useCallback } from "react";

// 로봇(rosbridge) 연결용 WebSocket 주소.
// 1) VITE_ROS_WS_URL 직접 지정 → 해당 주소로 연결 (예: 직접 rosbridge ws://192.168.x.x:9090)
// 2) 미지정 → VITE_API_BASE_URL(http→ws 변환)/ros 자동 파생 (로컬 Node 서버의 /ros 브릿지)
const ROS_WS_URL = (() => {
  const explicit = import.meta.env.VITE_ROS_WS_URL;
  if (explicit) return explicit;
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
  return apiBase.replace(/^http/, "ws").replace(/\/$/, "") + "/ros";
})();

// /app/nav_status 에서 오는 상태 코드 목록
const VALID_STATUSES = ["idle", "navigating", "succeeded", "failed", "canceled", "busy", "not_found", "invalid_request"];

export function useRosbridge() {
  const ws = useRef(null);
  const reconnectTimer = useRef(null);
  const subscribed = useRef(false);
  const [connStatus, setConnStatus] = useState("disconnected"); // disconnected | connecting | connected | error
  // 로봇이 보낸 상태: idle | navigating | succeeded | failed | canceled | busy | not_found | invalid_request
  const [navStatus, setNavStatus] = useState("idle");
  // 상태 문자열에 포함된 book_id (예: "navigating:0001" → "0001")
  const [navBookId, setNavBookId] = useState("");
  // 마지막 요청한 book_id (응답 매칭용)
  const requestBookId = useRef("");

  const send = useCallback((obj) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(obj));
    }
  }, []);

  const subscribeStatus = useCallback(() => {
    if (subscribed.current) return;
    subscribed.current = true;
    send({
      op: "subscribe",
      topic: "/app/nav_status",
      type: "std_msgs/msg/String",
    });
  }, [send]);

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    setConnStatus("connecting");
    ws.current = new WebSocket(ROS_WS_URL);

    ws.current.onopen = () => {
      setConnStatus("connected");
      subscribeStatus();
    };
    ws.current.onerror = () => setConnStatus("error");
    ws.current.onclose = () => {
      setConnStatus("disconnected");
      subscribed.current = false;
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.current.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.op === "topic" && msg.topic === "/app/nav_status") {
          const raw = (msg.msg?.data || "").trim();
          // "navigating:0001" → status, book_id 분리
          const [code, bookId] = raw.split(":");
          if (VALID_STATUSES.includes(code)) {
            setNavStatus(code);
            setNavBookId(bookId || "");
          }
        }
      } catch {/* ignore non-JSON */}
    };
  }, [subscribeStatus]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    subscribed.current = false;
    ws.current?.close();
    setConnStatus("disconnected");
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  /**
   * 앱 -> rosbridge -> /app/book_request (std_msgs/String)
   * 책의 ID(문자열)만 전송. 좌표는 로봇 측 JSON에서 book_id 키로 찾음.
   */
  const sendBookRequest = useCallback((bookId) => {
    if (ws.current?.readyState !== WebSocket.OPEN) {
      throw new Error("로봇과 연결되지 않았습니다.");
    }
    const id = String(bookId);
    requestBookId.current = id;
    // 낙관적 UX (브리지가 곧 navigating:<id> publish)
    setNavStatus("navigating");
    setNavBookId(id);

    send({
      op: "publish",
      topic: "/app/book_request",
      type: "std_msgs/msg/String",
      msg: { data: id },
    });
  }, [send]);

  const resetNavStatus = useCallback(() => {
    setNavStatus("idle");
    setNavBookId("");
    requestBookId.current = "";
  }, []);

  return { connStatus, navStatus, navBookId, sendBookRequest, resetNavStatus, connect, disconnect };
}