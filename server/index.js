// 먹똑 로컬 서버 — 도서 API + rosbridge WebSocket 브릿지
// 실행: npm install && npm start  (또는) npm run dev
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 도서 데이터(샘플) ──
const books = JSON.parse(
  readFileSync(join(__dirname, "books.json"), "utf-8")
);

// ── 설정 ──
const PORT = process.env.PORT || 3000;
const ROSBRIDGE_URL = process.env.ROSBRIDGE_URL || "ws://localhost:9090";

const app = express();

// CORS (Vite 프론트엔드 5173에서 호출 허용)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// GET /books              → 전체 목록
// GET /books?search=키워드 → 제목/저자/청구기호 부분 일치
app.get("/books", (req, res) => {
  const q = (req.query.search || "").toString().trim().toLowerCase();
  if (!q) return res.json(books);
  const filtered = books.filter((b) =>
    [b.title, b.author, b.call_number, b.isbn]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(q))
  );
  res.json(filtered);
});

// GET /books/:id → 단건 (id 또는 book_id)
app.get("/books/:id", (req, res) => {
  const id = req.params.id;
  const book = books.find(
    (b) => String(b.id) === id || String(b.book_id) === id
  );
  if (!book) return res.status(404).json({ error: "not_found" });
  res.json(book);
});

const httpServer = app.listen(PORT, () => {
  console.log(`📚 도서 API  → http://localhost:${PORT}/books`);
});

// ── /ros WebSocket 브릿지 (프론트엔드 ↔ rosbridge 투명 전달) ──
// 프론트엔드는 useRosbridge.js에서 ws://<이 서버>/ros 로 연결.
// 이 서버가 각 클라이언트마다 rosbridge(ROSBRIDGE_URL)로 투명 중계.
const wss = new WebSocketServer({ server: httpServer, path: "/ros" });

wss.on("connection", (clientSocket) => {
  console.log("🔗 프론트엔드가 /ros 에 연결됨");

  let rosSocket = null;
  const buffer = []; // rosbridge 연결 전 클라이언트 메시지 보관
  let closed = false;

  const connectRos = () => {
    console.log(`rosbridge 연결 시도: ${ROSBRIDGE_URL}`);
    rosSocket = new WebSocket(ROSBRIDGE_URL);

    rosSocket.on("open", () => {
      console.log("✅ rosbridge 연결됨 — 버퍼 전송");
      while (buffer.length) rosSocket.send(buffer.shift());
    });

    rosSocket.on("message", (data) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(data.toString());
      }
    });

    rosSocket.on("close", () => {
      rosSocket = null;
      if (closed) return;
      console.warn("rosbridge 연결 종료 — 3초 후 재시도");
      setTimeout(connectRos, 3000);
    });

    rosSocket.on("error", () => { /* close 이벤트에서 재시도 */ });
  };
  connectRos();

  // 클라이언트 → rosbridge
  clientSocket.on("message", (data) => {
    const str = data.toString();
    if (rosSocket && rosSocket.readyState === WebSocket.OPEN) {
      rosSocket.send(str);
    } else if (rosSocket && rosSocket.readyState === WebSocket.CONNECTING) {
      buffer.push(str);
    }
  });

  clientSocket.on("close", () => {
    closed = true;
    console.log("프론트엔드 연결 해제");
    rosSocket?.close();
  });
});

console.log(`🤖 rosbridge 대상: ${ROSBRIDGE_URL}`);