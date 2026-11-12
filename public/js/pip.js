/* Modo Mini Player. Em navegadores com suporte à Document Picture-in-Picture
   API (Chrome/Edge no computador), abre uma janelinha de verdade que fica
   por cima de qualquer outro app. Nos demais (a maioria dos celulares),
   cai para um cartão flutuante dentro da própria página — ainda útil para
   deixar no canto da tela enquanto se lê um PDF ao lado. */
let cleanup = null;

export async function openMiniPlayer({ getSnapshot, onPause, onStart }) {
  if (cleanup) { cleanup(); cleanup = null; return; }

  if ("documentPictureInPicture" in window) {
    try {
      const pipWin = await window.documentPictureInPicture.requestWindow({ width: 220, height: 140 });
      pipWin.document.body.style.cssText = "margin:0;background:#11141C;color:#EDEAE1;font-family:ui-sans-serif,system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px";
      pipWin.document.title = "Juntos";
      const clock = pipWin.document.createElement("div");
      clock.style.cssText = "font-size:32px;font-variant-numeric:tabular-nums;font-weight:300";
      const btn = pipWin.document.createElement("button");
      btn.style.cssText = "background:#FF6A45;color:#fff;border:none;border-radius:999px;padding:6px 16px;font-size:12px;cursor:pointer";
      pipWin.document.body.append(clock, btn);
      let paused = false;
      btn.textContent = "Pausar";
      btn.onclick = () => { paused = !paused; if (paused) onPause(); else onStart(); btn.textContent = paused ? "Continuar" : "Pausar"; };
      const iv = setInterval(() => { const s = getSnapshot(); clock.textContent = fmtClockLocal(s); }, 500);
      cleanup = () => { clearInterval(iv); try { pipWin.close(); } catch {} };
      pipWin.addEventListener("pagehide", () => { cleanup = null; });
      return;
    } catch { /* segue para o fallback abaixo */ }
  }

  // fallback: cartão flutuante dentro da própria página
  const box = document.createElement("div");
  box.className = "miniPlayerCard";
  box.innerHTML = `<span class="mpTime">00:00</span><button class="mpBtn">Pausar</button><button class="mpClose">✕</button>`;
  document.body.appendChild(box);
  const clock = box.querySelector(".mpTime"), btn = box.querySelector(".mpBtn");
  let paused = false;
  btn.onclick = () => { paused = !paused; if (paused) onPause(); else onStart(); btn.textContent = paused ? "Continuar" : "Pausar"; };
  box.querySelector(".mpClose").onclick = () => { box.remove(); cleanup = null; };
  const iv = setInterval(() => { clock.textContent = fmtClockLocal(getSnapshot()); }, 500);
  cleanup = () => { clearInterval(iv); box.remove(); };
}

function fmtClockLocal(s) {
  let sec = s.mode === "livre" ? s.elapsed : Math.max((s.target || 0) - s.elapsed, 0);
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
}
