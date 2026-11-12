/* ============================================================
   Service worker do Juntos
   - deixa o app instalável (celular e computador) e FUNCIONANDO SEM INTERNET
   - mantém a notificação do cronômetro com contagem regressiva viva,
     mesmo com o app minimizado ou a tela desligada
   Suba o número do CACHE a cada publicação.

   2.15 — por que o app podia dar "erro de página da web" offline (e o que mudou):
   1) Respostas REDIRECIONADAS: hospedagens como a Cloudflare Pages respondem "/index.html" com um
      redirecionamento para "/". O navegador RECUSA uma resposta marcada como "redirected" quando ela
      serve uma navegação (abrir o app) — o resultado é a página de erro do navegador, em vez do app.
      Agora toda resposta guardada/entregue é "limpa" (cleanResponse) antes de ir para o cache.
   2) Módulos fora da lista: os arquivos carregados sob demanda (amigo, frases, correção da meia-noite,
      resumo anual, exportar/importar, miniplayer, estatísticas aprofundadas…) NÃO estavam guardados, então
      tocar neles offline dava erro. Agora TODOS os arquivos do app são guardados na instalação.
   3) Dependências do SDK do Firebase: o SDK vem em 3 arquivos que importam outros arquivos do mesmo CDN.
      Só os 3 principais eram guardados; agora o instalador lê os "import" deles e guarda os demais.
   4) Instalação "pela metade": se a internet caía durante a primeira instalação, ficavam arquivos
      faltando para sempre. Agora, toda vez que o app abre COM internet, ele confere o que falta e completa
      (mensagem "precache"), e o service worker também tenta de novo ao ativar.
   5) Abrir pelo ícone instalado ("./index.html") sem internet agora cai no mesmo app guardado.
   2.20.1 — por que às vezes aparecia a versão ANTERIOR quebrada, e o que mudou:
   1) Antes cada arquivo era pedido à rede com limite de 4 s e, se demorasse, vinha do cache. Em rede lenta,
      uma abertura juntava arquivos NOVOS com ANTIGOS (app "deteriorado") até puxar para atualizar.
      Agora o app é uma GERAÇÃO única: a instalação baixa todos os arquivos ou nenhum (atômica) e tudo é
      servido do mesmo cache. Nunca há mistura.
   2) Abre na hora: sem esperar a rede para cada um dos ~55 arquivos (antes eram vários "viagens" em cascata).
   3) O worker novo NÃO assume sozinho (sem skipWaiting automático). Ele espera; quem decide é a página
      (js/updates.js), que o ativa e recarrega ANTES de mostrar a tela, ou quando o app está em segundo plano.
      Assim uma página já aberta nunca recebe arquivos de outra versão no meio do uso.
   REGRA: arquivo novo em public/ → entra em SHELL aqui; e sobe o número de CACHE. (tools/verificar-offline.mjs confere.)
============================================================ */
const CACHE = "juntos-v35";
// Arquivos do próprio app guardados na instalação (para abrir offline). Um por um e sem cancelar tudo
// se algum falhar (antes, UM arquivo ausente cancelava a instalação inteira).
const SHELL = [
  "./", "./index.html", "./main.js", "./firebase-config.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png",
  "./icons/badge-96.png", "./js/a11y.js", "./js/achievements.js", "./js/ambient.js",
  "./js/auth.js", "./js/breathe.js", "./js/comfort.js", "./js/connectivity.js",
  "./js/consistency.js", "./js/constants.js", "./js/crypto.js", "./js/dayrecap.js",
  "./js/deepstats.js", "./js/distractions.js", "./js/exportData.js", "./js/firebase.js",
  "./js/fixmidnight.js", "./js/flashcards.js", "./js/friend.js", "./js/fx.js", "./js/goals.js", "./js/gratitude-prompt.js",
  "./js/importData.js", "./js/messages.js", "./js/offlineStore.js", "./js/pip.js",
  "./js/privacy.js", "./js/quiet.js", "./js/quotes-data.js", "./js/quotes.js", "./js/pushsub.js", "./js/reminders.js", "./js/removecycles.js",
  "./js/room.js", "./js/spaced.js", "./js/stats.js", "./js/store.js", "./js/studylog-hours.js",
  "./js/studylog.js", "./js/subjects.js", "./js/tada-data.js", "./js/tada-history.js", "./js/tada.js", "./js/dom.js", "./js/motion.js", "./js/icons.js", "./js/timer.js", "./js/ui.js", "./js/updates.js", "./js/utils.js",
  "./js/ux.js", "./js/wallpaper.js", "./js/weekdetail.js", "./js/whatsnew.js",
  "./js/wrapped.js", "./privacidade.html", "./termos.html"
];
// O SDK do Firebase vem do CDN do Google (outro domínio). Sem guardá-lo, o app NÃO abre offline: o navegador
// não consegue nem carregar o código do login/banco. Os endereços têm a versão no nome (10.12.2), então
// nunca mudam de conteúdo: dá para servir do cache com segurança.
const SDK = ["https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js",
             "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js",
             "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"];
const SDK_PREFIX = "https://www.gstatic.com/firebasejs/10.12.2/";

// Remove a marca "redirected" (ver nota 1 acima): copia o conteúdo para uma resposta nova e limpa.
async function cleanResponse(r) {
  if (!r || !r.redirected) return r;
  const body = await r.blob();
  return new Response(body, { status: r.status, statusText: r.statusText, headers: r.headers });
}

// guarda UM arquivo (baixando da rede, ignorando o cache HTTP do navegador)
async function addOne(cache, url) {
  const r = await fetch(new Request(url, { cache: "reload" }));
  if (!r.ok) throw new Error("HTTP " + r.status);
  await cache.put(url, await cleanResponse(r));
}

// Guarda o SDK e, lendo o texto de cada arquivo, também os que ele importa (mesma pasta do CDN).
async function precacheSdk(cache) {
  const queue = [...SDK], seen = new Set();
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url) || !url.startsWith(SDK_PREFIX)) continue;
    seen.add(url);
    let res = await cache.match(url);
    if (!res) {
      try {
        const f = await fetch(url);
        if (!f.ok) continue;
        await cache.put(url, f.clone());
        res = f;
      } catch { continue; }
    }
    try {
      const text = await res.clone().text();
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) queue.push(new URL(m[1], url).href);
    } catch { /* não deu para ler: segue com os outros */ }
  }
}

// Completa o que faltar (só baixa o que ainda NÃO está guardado — barato de rodar sempre que o app abre).
async function precacheMissing() {
  const cache = await caches.open(CACHE);
  const missing = [];
  for (const u of SHELL) if (!(await cache.match(u, { ignoreSearch: true }))) missing.push(u);
  await Promise.allSettled(missing.map((u) => addOne(cache, u)));
  await precacheSdk(cache).catch(() => {});
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // ATÔMICO: todos os arquivos do app ou nenhum. Se algum falhar, a instalação falha, esta geração é
    // descartada e a versão que já funciona continua intacta (o navegador tenta de novo na próxima abertura).
    await Promise.all(SHELL.map((u) => addOne(c, u)));
    await precacheSdk(c).catch(() => {});   // o SDK é de outro domínio e tem versão fixa: melhor esforço
    // sem skipWaiting aqui: quem manda assumir é a página (mensagem "skip-waiting", abaixo)
  })());
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    await precacheMissing().catch(() => {});   // se a instalação ficou pela metade, completa agora
  })());
});

/* ---------- Cronômetro em segundo plano ---------- */
let timerState = null;   // { deadline, startedAt, countUp, label, subject, finishTitle, finishBody }
let ticker = null;

const pad = (n) => String(n).padStart(2, "0");
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

async function showTimerNotification({ body, title, vibrate = false, renotify = false }) {
  try {
    await self.registration.showNotification(title, {
      body,
      tag: "juntos-timer",
      renotify,
      silent: !vibrate,
      requireInteraction: !vibrate,   // a contagem fica fixa na barra; o aviso final some ao tocar
      vibrate: vibrate ? [250, 100, 250, 100, 450] : undefined,
      icon: "icons/icon-192.png",
      badge: "icons/badge-96.png",
      data: { kind: "timer" }
    });
  } catch {}
}

// horário no relógio do APARELHO de quem está olhando (viajando ou não, "termina às 15:30" bate com o relógio dela/dele)
function endTimeLabel(deadline) {
  try {
    return new Date(deadline).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function tickNotification() {
  if (!timerState) return;
  const now = Date.now();

  if (timerState.countUp) {
    const elapsed = (now - timerState.startedAt) / 1000;
    showTimerNotification({
      title: `Juntos · ${timerState.label}`,
      body: `${timerState.subject} — ${fmtClock(elapsed)} em andamento`
    });
    return;
  }

  const remaining = (timerState.deadline - now) / 1000;
  if (remaining <= 0) {
    // fim do ciclo: vibra, avisa e para de atualizar
    showTimerNotification({
      title: timerState.finishTitle,
      body: timerState.finishBody,
      vibrate: true,
      renotify: true
    });
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => list.forEach((c) => c.postMessage({ type: "phase-finished" })));
    stopTicker();
    timerState = null;
    return;
  }

  showTimerNotification({
    title: `Juntos · ${timerState.label}`,
    body: `${fmtClock(remaining)} restantes — ${timerState.subject} · termina às ${endTimeLabel(timerState.deadline)}`
  });
}

function startTicker() {
  stopTicker();
  tickNotification();
  // 1 segundo: mantém o número "andando" junto com o app.
  // Se o sistema operacional reduzir a frequência para economizar bateria, o
  // horário de término no texto continua correto, e o aviso final é garantido
  // pelo alarme abaixo.
  ticker = setInterval(tickNotification, 1000);
}
function stopTicker() {
  if (ticker) { clearInterval(ticker); ticker = null; }
}

self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (e.source && e.source.type && e.source.type !== "window") return; // só páginas do próprio app mandam comandos
  if (d.type === "start") {
    timerState = {
      deadline: d.deadline, startedAt: d.startedAt, countUp: !!d.countUp,
      label: d.label, subject: d.subject, finishTitle: d.finishTitle, finishBody: d.finishBody
    };
    startTicker();
    // mantém o service worker acordado até o fim do ciclo
    if (d.deadline && e.waitUntil) {
      e.waitUntil(new Promise((resolve) => {
        const ms = Math.max(0, d.deadline - Date.now()) + 2000;
        setTimeout(resolve, Math.min(ms, 10 * 60 * 1000));
      }));
    }
  } else if (d.type === "skip-waiting") {
    self.skipWaiting();
  } else if (d.type === "precache") {
    e.waitUntil(precacheMissing().catch(() => {}));
  } else if (d.type === "stop") {
    stopTicker(); timerState = null;
    self.registration.getNotifications({ tag: "juntos-timer" })
      .then((list) => list.forEach((n) => n.close())).catch(() => {});
  }
});

/* Lembrete com o app fechado (2.26): o servidor (worker-push/) manda um push SEM conteúdo na hora marcada e
   a frase vem daqui — assim nada pessoal viaja. Se o app já está aberto e na tela, não mostra (o app avisa
   por conta própria, dentro dele). O Chrome exige uma notificação por push; este é o único caso. */
const REMINDER_LINES = [
  "Quando se sentir pronto, seu espaço de foco está disponível.",
  "Seu espaço de estudo está aberto, sem pressa. Um ciclo curto já conta.",
  "Que tal um ciclo leve agora? Só se fizer sentido para você.",
  "Se hoje for um bom momento, o cronômetro espera por você."
];
self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === "visible")) return;
    const day = new Date().getDate();
    await self.registration.showNotification("Juntos", {
      body: REMINDER_LINES[day % REMINDER_LINES.length], tag: "juntos-reminder",
      icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: { kind: "reminder" }
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) if ("focus" in c) return c.focus();
      if (self.clients.openWindow) return self.clients.openWindow("./index.html");
    })
  );
});

/* ---------- Cache ---------- */
// Arquivos do app: SEMPRE da geração guardada (rápido e sem mistura de versões). Só o que não faz parte da
// geração (não está em SHELL) vai à rede, sem ser guardado — assim nada "velho" fica preso no cache.
async function fromCache(request) {
  const m = await caches.match(request, { ignoreSearch: true });
  if (m) return cleanResponse(m);
  if (request.mode === "navigate") {
    const shell = (await caches.match("./index.html")) || (await caches.match("./"));
    if (shell) return cleanResponse(shell);
  }
  return null;
}

async function appFile(request) {
  const hit = await fromCache(request);
  if (hit) return hit;
  try { return await fetch(request); }
  catch {
    return new Response("Sem conexão e este arquivo ainda não foi guardado no aparelho.", {
      status: 503, statusText: "Offline", headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

// o SDK do Firebase tem versão no endereço: cache primeiro (rápido e funciona offline)
async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const r = await fetch(request);
  if (r.ok || r.type === "opaque") {
    const copy = r.clone();
    caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
  }
  return r;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin === location.origin) { e.respondWith(appFile(req)); return; }
  // só o código do SDK é guardado; o resto de outros domínios (login, banco de dados ao vivo) passa direto
  if (url.origin === "https://www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) e.respondWith(cacheFirst(req));
});
