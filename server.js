#!/usr/bin/env node
/**
 * 먹똑 - 도서 검색용 Node.js API 서버
 *
 * 실행:
 *   node server.js
 *
 * 엔드포인트:
 *   GET /books            -> 전체 도서 목록
 *   GET /books?search=키워드 -> 제목/저자/청구기호/분류로 검색
 *   GET /books/:id        -> book_id 단건 조회 (예: /books/0001)
 *
 * 앱의 src/api/bookService.js 가 이 서버(기본 http://localhost:3000)를 호출합니다.
 */
import http from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 도서 데이터 (book_id 0001~0008)
const books = [
  { book_id: "0001", title: "코스모스", author: "칼 세이건", publisher: "사이언스북스", call_number: "520 세13코", category: "자연과학", floor: 3, shelf_section: "B", shelf_number: "B-05", pos_x: 4.2, pos_y: 1.1, is_available: true, cover_image_url: null, description: "우주의 기원과 인류의 역사를 장대하게 펼친 칼 세이건의 대표작." },
  { book_id: "0002", title: "총, 균, 쇠", author: "재레드 다이아몬드", publisher: "문학사상", call_number: "303.4 다68총", category: "사회과학", floor: 3, shelf_section: "C", shelf_number: "C-02", pos_x: 5.0, pos_y: 2.5, is_available: true, cover_image_url: null, description: "왜 어떤 민족은 다른 민족을 정복했는가? 문명의 불평등에 대한 탐구." },
  { book_id: "0003", title: "데미안", author: "헤르만 헤세", publisher: "민음사", call_number: "833.91 헤513데", category: "독일소설", floor: 2, shelf_section: "D", shelf_number: "D-08", pos_x: 2.0, pos_y: 5.5, is_available: true, cover_image_url: null, description: "자아를 찾아가는 한 소년의 성장 이야기." },
  { book_id: "0004", title: "이기적 유전자", author: "리처드 도킨스", publisher: "을유문화사", call_number: "576 도68이", category: "자연과학", floor: 3, shelf_section: "B", shelf_number: "B-09", pos_x: 4.2, pos_y: 2.0, is_available: false, cover_image_url: null, description: "유전자 중심의 진화론을 대중에게 알린 기념비적 과학서." },
  { book_id: "0005", title: "클린 코드", author: "로버트 마틴", publisher: "인사이트", call_number: "005.13 마68클", category: "컴퓨터", floor: 4, shelf_section: "E", shelf_number: "E-01", pos_x: 7.0, pos_y: 0.5, is_available: true, cover_image_url: null, description: "소프트웨어 장인 정신과 좋은 코드 작성법을 알려주는 개발자 필독서." },
  { book_id: "0006", title: "사피엔스", author: "유발 하라리", publisher: "김영사", call_number: "909 하23사", category: "역사", floor: 3, shelf_section: "C", shelf_number: "C-07", pos_x: 5.5, pos_y: 3.0, is_available: true, cover_image_url: null, description: "호모 사피엔스의 역사를 인지 혁명부터 현재까지 종합적으로 조망한 책." },
  { book_id: "0007", title: "파친코", author: "이민진", publisher: "인플루엔셜", call_number: "813.6 이49파", category: "한국소설", floor: 2, shelf_section: "A", shelf_number: "A-12", pos_x: 1.5, pos_y: 3.2, is_available: true, cover_image_url: null, description: "일제강점기부터 현대까지 재일 한국인 가족의 이야기를 담은 대하소설." },
  { book_id: "0008", title: "채식주의자", author: "한강", publisher: "창비", call_number: "813.6 한12채", category: "한국소설", floor: 2, shelf_section: "A", shelf_number: "A-13", pos_x: 1.5, pos_y: 3.8, is_available: false, cover_image_url: null, description: "2016년 맨부커상 수상작. 채식을 선언한 한 여성과 그 주변 인물들의 이야기." },
];

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function searchBooks(keyword) {
  const lower = keyword.toLowerCase().trim();
  if (!lower) return books;
  return books
    .filter(
      (b) =>
        b.title?.toLowerCase().includes(lower) ||
        b.author?.toLowerCase().includes(lower) ||
        b.call_number?.toLowerCase().includes(lower) ||
        b.category?.toLowerCase().includes(lower),
    )
    .map((b) => ({ ...b, id: b.book_id }));
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    sendJSON(res, 200, {});
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // GET /books
  if (req.method === "GET" && pathname === "/books") {
    const search = url.searchParams.get("search");
    sendJSON(res, 200, searchBooks(search || ""));
    return;
  }

  // GET /books/:id
  const match = pathname.match(/^\/books\/(.+)$/);
  if (req.method === "GET" && match) {
    const id = decodeURIComponent(match[1]);
    const book = books.find((b) => b.book_id === id || String(b.id) === id);
    if (!book) {
      sendJSON(res, 404, { message: "도서를 찾을 수 없습니다." });
      return;
    }
    sendJSON(res, 200, { ...book, id: book.book_id });
    return;
  }

  sendJSON(res, 404, { message: "알 수 없는 엔드포인트입니다." });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`📚 먹똑 도서 API 서버 실행 중: http://localhost:${PORT}`);
});