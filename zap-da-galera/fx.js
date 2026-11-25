/* Zap da Galera — eventos de tela cheia que os admins soltam no grupo. */
(function () {
  const EVENTS = [
    { kind: "danca", emoji: "🕺", name: "Dança", hint: "Bonecos dançando com luz de balada" },
    { kind: "confete", emoji: "🎉", name: "Confete", hint: "Chuva de confete colorido" },
    { kind: "fogos", emoji: "🎆", name: "Fogos", hint: "Fogos de artifício estourando" },
    { kind: "chuva", emoji: "🌧️", name: "Chuva de emoji", hint: "Escolha o emoji que vai chover" },
    { kind: "terremoto", emoji: "💥", name: "Terremoto", hint: "A tela inteira treme" },
    { kind: "parabens", emoji: "🎂", name: "Parabéns", hint: "Bolo e confete pro aniversariante" },
    { kind: "gol", emoji: "⚽", name: "Gol", hint: "GOOOOL! com a bola cruzando a tela" },
    { kind: "alerta", emoji: "🚨", name: "Alerta", hint: "Sirene piscando com o seu aviso" },
    { kind: "coracao", emoji: "💜", name: "Corações", hint: "Corações subindo pela tela" },
  ];
  const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const PAL = ["#7c5cff", "#22c55e", "#f59e0b", "#ec4899", "#3b82f6", "#ef4444", "#eab308", "#14b8a6"];

  let css = document.createElement("style");
  css.textContent = `
  #fx{position:fixed;inset:0;z-index:90;pointer-events:none;overflow:hidden}
  #fx canvas{position:absolute;inset:0;width:100%;height:100%}
  #fx .cap{position:absolute;left:50%;bottom:12%;transform:translateX(-50%);max-width:90vw;text-align:center;
    font:800 clamp(22px,5vw,44px)/1.1 Inter,system-ui,sans-serif;color:#fff;text-shadow:0 4px 24px rgba(0,0,0,.7);
    animation:fxIn .5s cubic-bezier(.2,1.4,.4,1) both}
  #fx .cap small{display:block;font-size:.45em;font-weight:600;opacity:.85;margin-top:6px}
  #fx .skip{pointer-events:auto;position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;background:rgba(0,0,0,.55);
    color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:8px 14px;font:600 14px Inter,sans-serif;cursor:pointer}
  @keyframes fxIn{0%{opacity:0;transform:translateX(-50%) scale(.6)}100%{opacity:1;transform:translateX(-50%) scale(1)}}
  @keyframes fxFade{to{opacity:0}}
  #fx.out{animation:fxFade .6s ease forwards}
  .fx-shake{animation:fxShake .12s linear infinite}
  @keyframes fxShake{0%{transform:translate(0,0) rotate(0)}25%{transform:translate(-9px,6px) rotate(-.6deg)}50%{transform:translate(8px,-7px) rotate(.5deg)}75%{transform:translate(-6px,-5px) rotate(-.4deg)}100%{transform:translate(7px,8px) rotate(.6deg)}}
  /* balada */
  #fx .club{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(30,10,60,.55),rgba(5,5,15,.85));animation:fxIn2 .4s both}
  @keyframes fxIn2{from{opacity:0}}
  #fx .beam{position:absolute;top:-10%;left:50%;width:180vmax;height:180vmax;margin-left:-90vmax;transform-origin:50% 0;
    background:conic-gradient(from 0deg at 50% 0%,transparent 0 160deg,var(--b) 170deg,transparent 180deg,transparent 340deg,var(--b) 350deg,transparent 360deg);
    opacity:.35;mix-blend-mode:screen;animation:fxSweep 2.4s ease-in-out infinite alternate}
  @keyframes fxSweep{from{transform:rotate(-28deg)}to{transform:rotate(28deg)}}
  #fx .ball{position:absolute;top:4%;left:50%;width:clamp(70px,12vw,120px);aspect-ratio:1;margin-left:calc(clamp(70px,12vw,120px)/-2);border-radius:50%;
    background:repeating-linear-gradient(0deg,#cfd5e6 0 7px,#7b84a3 7px 8px),repeating-linear-gradient(90deg,transparent 0 7px,#7b84a3 7px 8px);
    background-blend-mode:multiply;box-shadow:0 0 40px #fff8,inset -14px -14px 30px #0006,inset 10px 10px 24px #fff9;animation:fxSpin 1.2s linear infinite}
  #fx .ball::before{content:"";position:absolute;left:50%;top:-40vh;width:2px;height:40vh;background:#aab}
  @keyframes fxSpin{to{filter:hue-rotate(360deg)}}
  #fx .floor{position:absolute;left:0;right:0;bottom:0;height:22%;display:grid;grid-template-columns:repeat(8,1fr);perspective:400px}
  #fx .floor i{animation:fxTile .5s steps(1) infinite;opacity:.55}
  @keyframes fxTile{0%{background:#7c5cff}33%{background:#ec4899}66%{background:#22c55e}}
  #fx .crew{position:absolute;left:0;right:0;bottom:14%;display:flex;justify-content:center;gap:clamp(8px,4vw,48px)}
  #fx .dancer{width:clamp(90px,18vw,170px);animation:fxBounce .5s ease-in-out infinite alternate}
  @keyframes fxBounce{from{transform:translateY(0)}to{transform:translateY(-14px)}}
  #fx .dancer .armL{transform-origin:50px 52px;animation:fxArmL .5s ease-in-out infinite alternate}
  #fx .dancer .armR{transform-origin:50px 52px;animation:fxArmR .5s ease-in-out infinite alternate}
  #fx .dancer .legL{transform-origin:50px 92px;animation:fxLegL .5s ease-in-out infinite alternate}
  #fx .dancer .legR{transform-origin:50px 92px;animation:fxLegR .5s ease-in-out infinite alternate}
  #fx .dancer .hip{transform-origin:50px 92px;animation:fxHip .5s ease-in-out infinite alternate}
  @keyframes fxArmL{from{transform:rotate(-20deg)}to{transform:rotate(-150deg)}}
  @keyframes fxArmR{from{transform:rotate(150deg)}to{transform:rotate(20deg)}}
  @keyframes fxLegL{from{transform:rotate(8deg)}to{transform:rotate(-22deg)}}
  @keyframes fxLegR{from{transform:rotate(22deg)}to{transform:rotate(-8deg)}}
  @keyframes fxHip{from{transform:rotate(-7deg)}to{transform:rotate(7deg)}}
  /* outros */
  #fx .big{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-size:clamp(90px,22vw,220px);line-height:1;filter:drop-shadow(0 10px 30px rgba(0,0,0,.5))}
  #fx .pop{animation:fxPop .9s cubic-bezier(.2,1.6,.4,1) both, fxWob 1s ease-in-out .9s infinite alternate}
  @keyframes fxPop{from{transform:translate(-50%,-50%) scale(0) rotate(-30deg)}to{transform:translate(-50%,-50%) scale(1)}}
  @keyframes fxWob{from{transform:translate(-50%,-50%) rotate(-6deg)}to{transform:translate(-50%,-50%) rotate(6deg)}}
  #fx .gol{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font:900 clamp(60px,16vw,180px)/1 Inter,sans-serif;letter-spacing:-.03em;
    color:#facc15;-webkit-text-stroke:4px #166534;text-shadow:0 10px 0 #166534,0 20px 40px rgba(0,0,0,.6);animation:fxGol .5s cubic-bezier(.2,1.6,.4,1) both,fxPulse .45s ease-in-out .5s infinite alternate}
  @keyframes fxGol{from{transform:translate(-50%,-50%) scale(.2)}to{transform:translate(-50%,-50%) scale(1)}}
  @keyframes fxPulse{to{transform:translate(-50%,-50%) scale(1.08)}}
  #fx .ballrun{position:absolute;top:62%;left:-15%;font-size:clamp(50px,10vw,100px);animation:fxRun 1.6s cubic-bezier(.3,.1,.3,1) infinite}
  @keyframes fxRun{0%{left:-15%;transform:rotate(0)}100%{left:110%;transform:rotate(900deg)}}
  #fx .siren{position:absolute;inset:0;animation:fxSiren .5s steps(1) infinite;box-shadow:inset 0 0 160px 40px #ef4444}
  @keyframes fxSiren{50%{box-shadow:inset 0 0 160px 40px #3b82f6}}
  #fx .crack{position:absolute;inset:0;width:100%;height:100%;opacity:.85}
  #fx .fall{position:absolute;top:-12vh;animation:fxFall linear forwards}
  @keyframes fxFall{to{transform:translateY(125vh) rotate(var(--r))}}
  #fx .rise{position:absolute;bottom:-12vh;animation:fxRise ease-in forwards}
  @keyframes fxRise{to{transform:translate(var(--x),-125vh) scale(1.3);opacity:.2}}
  @media (prefers-reduced-motion:reduce){#fx *{animation-duration:0s!important;animation-iteration-count:1!important}}
  `;
  document.head.appendChild(css);

  let cur = null;
  function stop() {
    if (!cur) return;
    const c = cur; cur = null;
    c.raf && cancelAnimationFrame(c.raf);
    c.timers.forEach(clearTimeout);
    document.querySelector(".app")?.classList.remove("fx-shake");
    c.el.classList.add("out");
    setTimeout(() => c.el.remove(), 600);
  }

  function dancerSVG(color, skin) {
    return `<svg class="dancer" viewBox="0 0 100 150" aria-hidden="true">
      <ellipse cx="50" cy="146" rx="26" ry="4" fill="rgba(0,0,0,.35)"/>
      <g class="hip">
        <g class="legL"><path d="M50 92 L36 120 L30 142" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
        <g class="legR"><path d="M50 92 L64 120 L72 142" stroke="${color}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
        <path d="M50 92 L50 50" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
        <g class="armL"><path d="M50 52 L50 74 L50 92" stroke="${skin}" stroke-width="8" fill="none" stroke-linecap="round" transform="rotate(0 50 52)"/></g>
        <g class="armR"><path d="M50 52 L50 74 L50 92" stroke="${skin}" stroke-width="8" fill="none" stroke-linecap="round"/></g>
        <circle cx="50" cy="30" r="15" fill="${skin}"/>
        <path d="M36 26 Q50 8 64 26 Q58 17 50 17 Q42 17 36 26Z" fill="#1f1300"/>
        <rect x="38" y="25" width="24" height="7" rx="3" fill="#111"/>
        <path d="M43 37 Q50 42 57 37" stroke="#3b1d0a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      </g></svg>`;
  }

  function canvasLayer(el) {
    const cv = document.createElement("canvas"); el.appendChild(cv);
    const dpr = Math.min(2, devicePixelRatio || 1);
    const fit = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    fit();
    const ctx = cv.getContext("2d"); ctx.scale(dpr, dpr);
    return { cv, ctx, W: () => innerWidth, H: () => innerHeight };
  }

  function confetti(c, el, colors, ms) {
    const L = canvasLayer(el), parts = [];
    const add = (n) => { for (let i = 0; i < n; i++) parts.push({ x: rnd(0, L.W()), y: rnd(-L.H() * .4, -10), vx: rnd(-1.5, 1.5), vy: rnd(2, 5),
      w: rnd(6, 12), h: rnd(8, 16), r: rnd(0, 6), vr: rnd(-.2, .2), c: pick(colors) }); };
    add(160); const t0 = performance.now();
    const step = (t) => {
      L.ctx.clearRect(0, 0, L.W(), L.H());
      if (t - t0 < ms * .6 && parts.length < 420) add(4);
      for (const p of parts) { p.x += p.vx + Math.sin((t + p.y) / 300); p.y += p.vy; p.r += p.vr;
        L.ctx.save(); L.ctx.translate(p.x, p.y); L.ctx.rotate(p.r); L.ctx.fillStyle = p.c; L.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); L.ctx.restore(); }
      if (cur === c) c.raf = requestAnimationFrame(step);
    };
    c.raf = requestAnimationFrame(step);
  }

  function fireworks(c, el, ms) {
    const L = canvasLayer(el), sparks = [], rockets = [];
    const launch = () => rockets.push({ x: rnd(L.W() * .15, L.W() * .85), y: L.H(), ty: rnd(L.H() * .12, L.H() * .45), c: pick(PAL) });
    const t0 = performance.now(); let last = 0;
    const step = (t) => {
      L.ctx.fillStyle = "rgba(5,5,20,.22)"; L.ctx.fillRect(0, 0, L.W(), L.H());
      if (t - last > 380 && t - t0 < ms - 1200) { launch(); last = t; }
      for (let i = rockets.length - 1; i >= 0; i--) { const r = rockets[i]; r.y -= 9;
        L.ctx.fillStyle = "#fff"; L.ctx.fillRect(r.x - 1.5, r.y, 3, 10);
        if (r.y <= r.ty) { rockets.splice(i, 1); for (let k = 0; k < 70; k++) { const a = rnd(0, Math.PI * 2), s = rnd(1.5, 6.5);
          sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, c: Math.random() < .2 ? "#fff" : r.c }); } } }
      for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy += .07; p.vx *= .985; p.life -= .012;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        L.ctx.globalAlpha = p.life; L.ctx.fillStyle = p.c; L.ctx.beginPath(); L.ctx.arc(p.x, p.y, 2.4, 0, 7); L.ctx.fill(); L.ctx.globalAlpha = 1; }
      if (cur === c) c.raf = requestAnimationFrame(step);
    };
    c.raf = requestAnimationFrame(step);
  }

  function rain(el, emoji, n, ms) {
    for (let i = 0; i < n; i++) { const s = document.createElement("span"); s.className = "fall"; s.textContent = emoji;
      s.style.left = rnd(-2, 98) + "vw"; s.style.fontSize = rnd(26, 60) + "px"; s.style.setProperty("--r", rnd(-360, 360) + "deg");
      s.style.animationDuration = rnd(2.2, 4.2) + "s"; s.style.animationDelay = rnd(0, ms / 1000 - 2.5) + "s"; el.appendChild(s); }
  }
  function rise(el, emojis, n, ms) {
    for (let i = 0; i < n; i++) { const s = document.createElement("span"); s.className = "rise"; s.textContent = pick(emojis);
      s.style.left = rnd(0, 95) + "vw"; s.style.fontSize = rnd(26, 64) + "px"; s.style.setProperty("--x", rnd(-80, 80) + "px");
      s.style.animationDuration = rnd(2.6, 4.6) + "s"; s.style.animationDelay = rnd(0, ms / 1000 - 2.8) + "s"; el.appendChild(s); }
  }

  function caption(el, title, by) {
    if (!title && !by) return;
    const d = document.createElement("div"); d.className = "cap";
    d.textContent = title || "";
    if (by) { const s = document.createElement("small"); s.textContent = by; d.appendChild(s); }
    el.appendChild(d);
  }

  /** Toca um evento. text = mensagem do admin (ou emoji, na chuva); by = "JG soltou". */
  function play(kind, text, by) {
    stop();
    const el = document.createElement("div"); el.id = "fx"; document.body.appendChild(el);
    const c = { el, timers: [], raf: 0 }; cur = c;
    const skip = document.createElement("button"); skip.className = "skip"; skip.textContent = "Pular ✕"; skip.onclick = stop;
    let ms = 6000; const t = (text || "").trim();
    switch (kind) {
      case "danca": {
        el.insertAdjacentHTML("beforeend", `<div class="club"></div>
          <div class="beam" style="--b:#ec4899"></div><div class="beam" style="--b:#22c55e;animation-delay:-1.2s;animation-direction:alternate-reverse"></div>
          <div class="beam" style="--b:#7c5cff;animation-delay:-.6s"></div><div class="ball"></div>
          <div class="floor">${"<i></i>".repeat(8).replace(/<i>/g, () => `<i style="animation-delay:-${rnd(0, .5).toFixed(2)}s">`)}</div>
          <div class="crew">${dancerSVG("#7c5cff", "#c68642")}${dancerSVG("#f59e0b", "#8d5524")}${dancerSVG("#22c55e", "#f1c27d")}</div>`);
        el.querySelectorAll(".dancer").forEach((d, i) => { d.style.animationDelay = (-i * .17) + "s";
          d.querySelectorAll("g").forEach((g) => g.style.animationDelay = (-i * .17) + "s"); });
        caption(el, t || "🕺 Bora dançar! 💃", by); ms = 7000; break;
      }
      case "confete": confetti(c, el, PAL, 5000); caption(el, t || "🎉🎉🎉", by); ms = 5500; break;
      case "fogos": fireworks(c, el, 6500); caption(el, t || "🎆 Uhuuu! 🎆", by); ms = 6500; break;
      case "chuva": { const e = t && [...t].length <= 4 ? t : "🎉"; rain(el, e, 70, 5500); caption(el, "", by); ms = 6000; break; }
      case "terremoto": {
        document.querySelector(".app")?.classList.add("fx-shake");
        el.insertAdjacentHTML("beforeend", `<svg class="crack" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M50 0 L46 18 L55 30 L44 47 L53 62 L41 80 L48 100" stroke="#fff" stroke-width=".5" fill="none"/>
          <path d="M55 30 L70 36 L82 33 M44 47 L28 52 L15 49 M53 62 L66 70" stroke="#fff" stroke-width=".35" fill="none"/></svg>
          <div class="big pop">💥</div>`);
        c.timers.push(setTimeout(() => document.querySelector(".app")?.classList.remove("fx-shake"), 2600));
        caption(el, t || "TERREMOTO!", by); ms = 4000; break;
      }
      case "parabens": el.insertAdjacentHTML("beforeend", `<div class="big pop">🎂</div>`);
        confetti(c, el, PAL, 5000); caption(el, "Parabéns" + (t ? ", " + t : "") + "! 🥳", by); ms = 6500; break;
      case "gol": el.insertAdjacentHTML("beforeend", `<div class="gol">GOOOOL!</div><div class="ballrun">⚽</div>`);
        confetti(c, el, ["#22c55e", "#facc15", "#16a34a", "#fde047", "#fff"], 5000); caption(el, t, by); ms = 6000; break;
      case "alerta": el.insertAdjacentHTML("beforeend", `<div class="siren"></div><div class="big pop">🚨</div>`);
        caption(el, t || "ATENÇÃO, GALERA!", by); ms = 5000; break;
      case "coracao": rise(el, ["💜", "❤️", "💖", "💕", "🩷"], 60, 5500); caption(el, t, by); ms = 6000; break;
      default: el.remove(); cur = null; return;
    }
    el.appendChild(skip);
    if (reduce()) ms = Math.min(ms, 3500);
    c.timers.push(setTimeout(stop, ms));
  }

  window.ZapFX = { EVENTS, play, stop };
})();
