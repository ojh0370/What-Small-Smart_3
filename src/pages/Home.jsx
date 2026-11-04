import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import SearchBar from "../components/SearchBar";
import BookCard from "../components/BookCard";
import BookDetail from "../components/BookDetail";
import ContinuePrompt from "../components/ContinuePrompt";
import { bookService } from "../api/bookService";
import { useRosbridge } from "../context/RosbridgeContext";
import { BookOpen, Bot, ShieldAlert } from "lucide-react";

const HOME_ID = "0000"; // 복귀 위치 ID
// 로봇이 이동에 실패했을 때 오는 상태들 (이때는 도착 화면을 기다리지 않아요)
const FAIL_STATUSES = ["failed", "canceled", "busy", "not_found", "invalid_request"];

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedBook, setSelectedBook] = useState(null);

  const { navStatus, navBookId, sendBookRequest, resetNavStatus } = useRosbridge();
  const [showContinue, setShowContinue] = useState(false); // "계속 이용하시겠습니까?" 화면
  const [returnError, setReturnError] = useState(""); // 복귀 명령 실패 안내
  // 방문자가 "로봇으로 안내받기"를 눌러서 도착을 기다리는 책 번호 (없으면 null)
  const waitingBookId = useRef(null);

  const handleSearch = async (q) => {
    setLoading(true);
    setSearched(true);
    setSelectedBook(null);
    const results = await bookService.search(q);
    setResults(results);
    setLoading(false);
  };

  // 로봇이 도착(succeeded)하면 "계속 이용하시겠습니까?" 화면을 띄워요.
  // - 방문자가 이 화면에서 요청한 책일 때만 (예전 값이나 다른 사람의 도착에는 반응 X)
  // - 복귀(0000) 도착일 때는 띄우지 않아요 (무한 반복 방지)
  useEffect(() => {
    if (navStatus === "succeeded") {
      const waiting = waitingBookId.current;
      if (!waiting || navBookId === HOME_ID) return;
      if (navBookId && navBookId !== waiting) return;
      waitingBookId.current = null; // 한 번만 띄우기
      setShowContinue(true);
    } else if (FAIL_STATUSES.includes(navStatus)) {
      waitingBookId.current = null; // 이동 실패 → 도착 기다림 취소
    }
  }, [navStatus, navBookId]);

  // 검색 화면(처음 화면)으로 돌아가기
  // 다음 사람이 바로 쓸 수 있게 검색 결과도 비워요. 결과를 남기고 싶으면 아래 두 줄을 지우세요.
  const goToSearchScreen = () => {
    setShowContinue(false);
    setSelectedBook(null);
    setResults([]);
    setSearched(false);
  };

  // "계속 이용" 버튼 → 검색 화면으로
  const handleContinue = () => {
    resetNavStatus();
    goToSearchScreen();
  };

  // 복귀 명령 보내기 (실패하면 안내 + 다시 시도 버튼)
  const sendReturn = () => {
    try {
      setReturnError("");
      sendBookRequest(HOME_ID);
    } catch (e) {
      setReturnError(e.message || "복귀 명령을 보내지 못했어요.");
    }
  };

  // 15초가 지나면 → 복귀 명령 + 검색 화면으로
  const handleAutoReturn = () => {
    sendReturn();
    goToSearchScreen();
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="bg-primary text-primary-foreground px-6 py-5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-accent-gold rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight leading-none">라비</h1>
            <p className="text-xs text-primary-foreground/60 mt-0.5">도서관 안내 로봇</p>
          </div>
        </div>
        <Link
          to="/buzzer"
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          title="추종 안전 모니터"
        >
          <ShieldAlert className="w-4 h-4" />
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* Hero */}
        {!searched && (
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-accent-gold/10 rounded-full flex items-center justify-center mx-auto mb-5">
              <BookOpen className="w-10 h-10 text-accent-gold" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">어떤 책을 찾고 계신가요?</h2>
            <p className="text-muted-foreground text-sm">제목, 저자, 청구기호로 검색하세요</p>
          </div>
        )}

        <SearchBar onSearch={handleSearch} />

        {/* Results */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-3 border-border border-t-accent-gold rounded-full animate-spin" />
          </div>
        )}

        {!loading && searched && results.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-foreground font-medium">검색 결과가 없습니다</p>
            <p className="text-muted-foreground text-sm mt-1">다른 검색어로 시도해보세요</p>
          </div>
        )}

        {!loading && results.length > 0 && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-muted-foreground font-medium">{results.length}권의 도서를 찾았습니다</p>
            {results.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onClick={() => setSelectedBook(book)}
              />
            ))}
          </div>
        )}
      </main>

      {selectedBook && (
        <BookDetail
          book={selectedBook}
          onClose={() => setSelectedBook(null)}
          onGuideRequested={(id) => {
            waitingBookId.current = id; // 이 책이 도착하면 "계속 이용" 화면을 띄울 준비
          }}
        />
      )}

      {showContinue && (
        <ContinuePrompt onContinue={handleContinue} onTimeout={handleAutoReturn} />
      )}

      {returnError && (
        <div className="fixed top-4 left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl bg-red-600 px-4 py-3 text-white shadow-xl">
          <span className="flex-1 text-sm font-semibold">⚠️ {returnError}</span>
          <button
            type="button"
            onClick={sendReturn}
            className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold hover:bg-white/30"
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={() => setReturnError("")}
            className="text-xs underline"
          >
            닫기
          </button>
        </div>
      )}
    </div>
  );
}
