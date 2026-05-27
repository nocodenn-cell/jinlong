# Jīn Lóng — Login UI kit

Recreation of the **login splash** as it ships in `pdv-importados/app/login`.

The login is its own visual world: absolute-black background, the Jīn Lóng
hero dragon image with a halo glow, the `Jīn Lóng | 金龍` wordmark in Cinzel
serif (gold `#bfa76a`), and a minimal underline-style form with a single
luxury-gold submit button.

The form **does not** use the standard `app-btn-accent` / `app-input` classes
— login is the one place where the system deliberately breaks rhythm to feel
ceremonial. See `Login.jsx` for the bespoke `login-premium-*` styles.

## Files

| File | Role |
|---|---|
| `index.html` | Renders the full login screen, including transitions in/out of the "inactivity" notice. |
| `LoginForm.jsx` | The form: email + password underline inputs, submit button, error state. |
| `Wordmark.jsx` | The `Jīn Lóng | 金龍` ceremonial wordmark (Cinzel + Noto Serif SC). |
| `DragonHero.jsx` | The breathing hero dragon image with vignette. |

## Real product copy

| Key | Portuguese | Han |
|---|---|---|
| Wordmark | `Jīn Lóng` | `金龍` |
| Email label | `E-mail` | `邮箱` |
| Password label | `Senha` | `密码` |
| Submit | `Entrar` / `Entrando…` | `登录` / `登录中…` |
| Inactivity | `Sua sessão expirou por inatividade. Faça login novamente.` | |
