// SearchBar.jsx — the fat search input for barcode / name / pinyin.
function SearchBar({ value, onChange, onSubmit, disabled, autoFocus }) {
  const inputRef = React.useRef(null);
  React.useEffect(() => { if (autoFocus) inputRef.current && inputRef.current.focus(); }, [autoFocus]);
  return (
    <form className="caixa-search-wrap" onSubmit={(e) => { e.preventDefault(); onSubmit && onSubmit(value); }}>
      <span className="caixa-search-icon" aria-hidden>
        {/* Lucide search */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </span>
      <input
        ref={inputRef}
        className="caixa-search-input"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar produto · código de barras · 名称…"
        disabled={disabled}
        autoComplete="off" spellCheck="false"
        aria-label="Buscar produto"
      />
    </form>
  );
}

window.SearchBar = SearchBar;
