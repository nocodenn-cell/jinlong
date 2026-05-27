// Wordmark.jsx — Cinzel "Jīn Lóng" + Noto Serif SC "金龍" line.
// Used only on the login splash; everywhere else uses the Noto Sans SC
// wordmark from components.css.
function Wordmark() {
  return (
    <h1 className="login-premium-wordmark">
      <span className="login-premium-wordmark-han">金龍</span>
      <span className="login-premium-divider" aria-hidden>|</span>
      <span className="login-premium-wordmark-roman">Jīn Lóng</span>
    </h1>
  );
}

window.Wordmark = Wordmark;
