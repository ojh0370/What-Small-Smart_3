// 먹똑 로컬 서버 — 도서 API + rosbridge WebSocket 브릿지 (MongoDB 영구 저장)
// 실행: npm install && npm start  (또는) npm run dev
import express from "express";
import mongoose from "mongoose";
import { WebSocketServer, WebSocket } from "ws";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 설정 ──
const PORT = process.env.PORT || 3000;
const ROSBRIDGE_URL = process.env.ROSBRIDGE_URL || "ws://localhost:9090";
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("에러: MONGODB_URI 환경 변수가 설정되지 않았습니다.");
  process.exit(1);
}

// ── MongoDB 스키마 ──
const bookSchema = new mongoose.Schema({
  id: Number,
  book_id: { type: String, unique: true },
  title: String,
  author: String,
  publisher: String,
  call_number: String,
  isbn: String,
  floor: Number,
  shelf_section: String,
  shelf_number: mongoose.Schema.Types.Mixed,
  is_available: Boolean,
  description: String,
});
const Book = mongoose.model("Book", bookSchema);

const robotStatusSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "robot" },
  status: { type: String, default: "idle" }, // idle | navigating:0001 | succeeded:0001 | failed 등
  updatedAt: { type: Date, default: Date.now },
});
const RobotStatus = mongoose.model("RobotStatus", robotStatusSchema);

async function seedBooksIfEmpty() {
  const count = await Book.countDocuments();
  if (count > 0) return;
  const seed = JSON.parse(readFileSync(join(__dirname, "books.json"), "utf-8"));
  await Book.insertMany(seed);
  console.log(`📚 초기 도서 데이터 ${seed.length}건 저장 완료`);
}

async function saveRobotStatus(statusText) {
  await RobotStatus.findOneAndUpdate(
    { key: "robot" },
    { status: statusText, updatedAt: new Date() },
    { upsert: true }
  );
}

const app = express();

// CORS (Vite 프론트엔드에서 호출 허용)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// GET /books              → 전체 목록
// GET /books?search=키워드 → 제목/저자/청구기호 부분 일치
app.get("/books", async (req, res) => {
  const q = (req.query.search || "").toString().trim();
  const filter = q
    ? {
        $or: [
          { title: { $regex: q, $options: "i" } },
          { author: { $regex: q, $options: "i" } },
          { call_number: { $regex: q, $options: "i" } },
          { isbn: { $regex: q, $options: "i" } },
        ],
      }
    : {};
  const books = await Book.find(filter).lean();
  res.json(books);
});

// GET /books/:id → 단건 (id 또는 book_id)
app.get("/books/:id", async (req, res) => {
  const id = req.params.id;
  const book = await Book.findOne({ $or: [{ book_id: id }, { id: Number(id) || -1 }] }).lean();
  if (!book) return res.status(404).json({ error: "not_found" });
  res.json(book);
});

// GET /robot-status → 마지막으로 저장된 로봇 상태 조회
app.get("/robot-status", async (req, res) => {
  const doc = await RobotStatus.findOne({ key: "robot" }).lean();
  res.json({ status: doc?.status || "idle" });
});

async function startServer() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ MongoDB 연결 성공!");
  await seedBooksIfEmpty();

  const httpServer = app.listen(PORT, () => {
    console.log(`📚 도서 API  → http://localhost:${PORT}/books`);
  });

  // ── /ros WebSocket 브릿지 (프론트엔드 ↔ rosbridge 투명 전달) ──
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
        const str = data.toString();
        // /app/nav_status 메시지는 DB에도 저장해서 서버 재시작 후에도 마지막 상태를 기억
        try {
          const parsed = JSON.parse(str);
          console.log(`[rosbridge→서버] op=${parsed.op} topic=${parsed.topic} data=${parsed.msg?.data || ""}`);
          if ((parsed.op === "topic" || parsed.op === "publish") && parsed.topic === "/app/nav_status") {
            const statusText = parsed.msg?.data;
            if (statusText) saveRobotStatus(statusText);
          }
        } catch {/* ignore non-JSON */}

        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(str);
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
      try {
        const parsed = JSON.parse(str);
        console.log(`[프론트→rosbridge] op=${parsed.op} topic=${parsed.topic} data=${parsed.msg?.data || ""}`);
      } catch {/* ignore non-JSON */}
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
}

startServer().catch((err) => {
  console.error("서버 시작 실패:", err);
  process.exit(1);
});