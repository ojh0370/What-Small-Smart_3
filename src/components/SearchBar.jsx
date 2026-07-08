import { useState } from "react";
import { Search } from "lucide-react";

export default function SearchBar({ onSearch }) {
  const [value, setValue] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (value.trim()) onSearch(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <div className="flex items-center bg-card border border-border rounded-2xl shadow-sm overflow-hidden focus-within:ring-2 focus-within:ring-accent-gold/40 focus-within:border-accent-gold transition-all">
        <Search className="w-5 h-5 text-muted-foreground ml-4 shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="책 제목, 저자, 청구기호 입력..."
          className="flex-1 bg-transparent px-4 py-4 text-sm text-foreground placeholder:text-muted-foreground outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className="m-2 bg-primary text-primary-foreground px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-primary/90 transition-colors"
        >
          검색
        </button>
      </div>
    </form>
  );
}