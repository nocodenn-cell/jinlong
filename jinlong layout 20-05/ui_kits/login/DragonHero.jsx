// DragonHero.jsx — login splash double-dragon mark with breathing animation.
function DragonHero() {
  return (
    <div className="login-premium-dragon-frame">
      <div className="login-premium-dragon-media">
        <img
          src="../../assets/brand-double-dragon.png"
          alt=""
          className="login-premium-dragon-img dragon-hero-mark"
          width={280}
          height={280}
        />
      </div>
      <div className="login-premium-vignette" />
    </div>
  );
}

window.DragonHero = DragonHero;
