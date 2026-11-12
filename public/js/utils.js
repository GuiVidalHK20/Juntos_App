import { GERAL, BR_TZ } from "./constants.js";
import { store } from "./store.js";
import { announce } from "./a11y.js";

export const $ = (id) => document.getElementById(id);
export const pad = (n) => String(n).padStart(2, "0");

/* ============================================================
   HORA E FUSO HORÁRIO (2.13) — feito com Intl, a biblioteca de internacionalização que já vem
   em todo navegador (sem baixar nada, sem tabela de fusos escrita à mão).

   Por que isto existe: antes, "agora em Brasília" era obtido formatando a data como TEXTO e
   lendo o texto de volta (new Date(texto)). Isso depende de como cada navegador escreve datas,
   quebra em alguns (Safari antigo, idiomas diferentes) e pode errar por 1 hora em dias de
   mudança de horário de verão. Agora o fuso é perguntado diretamente ao Intl, que devolve
   ano/mês/dia/hora/minuto/segundo já separados (formatToParts) — sem adivinhar nada.

   Regra do app (não mudou): "hoje" é sempre o dia no fuso de referência (por padrão Brasília),
   e NÃO o fuso do aparelho. Assim, uma sala com pessoas em lugares diferentes concorda sobre o
   que é "hoje", e o histórico antigo continua batendo com as datas já gravadas. O fuso de
   referência fica em UM lugar só: getAppTimeZone(). Se um dia o app ganhar uma opção "usar o
   fuso do meu aparelho", é só aqui que muda.
============================================================ */
const _tzOk = new Map();   // validar um fuso cria um Intl.DateTimeFormat (caro); o resultado para um nome nunca muda
export function isValidTimeZone(tz) {
  if (typeof tz === "string" && _tzOk.has(tz)) return _tzOk.get(tz);
  let ok = false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); ok = typeof tz === "string" && tz.length > 0; }
  catch { ok = false; }
  if (typeof tz === "string") _tzOk.set(tz, ok);
  return ok;
}
// fuso de referência do app; cai no padrão (Brasília) se o valor for inválido
export function getAppTimeZone() { return isValidTimeZone(BR_TZ) ? BR_TZ : "UTC"; }

const _partFmt = new Map(); // um Intl.DateTimeFormat por fuso (criar é caro; reaproveitar é seguro)
function partsFormatter(tz) {
  let f = _partFmt.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric"
    });
    _partFmt.set(tz, f);
  }
  return f;
}
/* Ano/mês/dia/hora/minuto/segundo de um instante, vistos no fuso `tz`.
   (hourCycle h23 garante 0–23; o antigo "hour12:false" devolvia 24 à meia-noite em alguns navegadores.) */
let _zpKey = "", _zpVal = null;   // memória do último cálculo: o resultado só depende do segundo e do fuso
export function zonedParts(date = new Date(), tz = getAppTimeZone()) {
  const t = date.getTime();
  const key = Number.isFinite(t) ? `${Math.floor(t / 1000)}|${tz}` : "";
  // telas como Estatísticas chamam brNow() dezenas de vezes seguidas no mesmo instante; formatar com Intl é o custo
  if (key && key === _zpKey) return { ..._zpVal };
  const out = {};
  for (const p of partsFormatter(tz).formatToParts(date)) if (p.type !== "literal") out[p.type] = Number(p.value);
  if (out.hour === 24) out.hour = 0; // rede de segurança para motores que ignoram hourCycle
  const val = { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
  if (key) { _zpKey = key; _zpVal = val; }
  return { ...val };
}

// "agora" no fuso de referência, como um Date cujos getters (getFullYear, getDate, getDay,
// getHours…) mostram a hora de lá — o resto do código já usa esses getters e não precisa saber
// que existe um fuso por trás.
export function brNow(date = new Date()) {
  const z = zonedParts(date);
  return new Date(z.year, z.month - 1, z.day, z.hour, z.minute, z.second, date.getMilliseconds());
}

export const dateKey = (d = brNow()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/* ---------- Datas como TEXTO "AAAA-MM-DD" (2.15) ----------
   O app guarda cada dia como uma chave de texto (ex.: "2026-10-22"). Somar/subtrair dias e contar
   a distância entre dois dias é só aritmética de CALENDÁRIO: não depende do fuso nem do horário de
   verão do aparelho. Antes, isso era feito com `new Date(...)` + `setDate()` no relógio local do
   aparelho, que em fusos com mudança de horário à meia-noite (ex.: Chile, Cuba) podia pular ou repetir
   um dia e quebrar a sequência (streak). Aqui tudo passa por Date.UTC, que não tem horário de verão. */
export function parseDateKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
export function shiftDateKey(key, days) {
  const p = parseDateKey(key);
  if (!p) return key;
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
// quantos dias de calendário vão de a até b (b - a); NaN se alguma chave for inválida
export function daysBetweenKeys(a, b) {
  const pa = parseDateKey(a), pb = parseDateKey(b);
  if (!pa || !pb) return NaN;
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
}
// dia da semana de uma chave (0 = domingo … 6 = sábado)
export function weekdayOfKey(key) {
  const p = parseDateKey(key);
  return p ? new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay() : NaN;
}
// chave de "hoje" no fuso de referência (ver getAppTimeZone), direto do Intl
export function todayKey(date = new Date()) {
  const z = zonedParts(date);
  return `${z.year}-${pad(z.month)}-${pad(z.day)}`;
}
// data-chave de "hoje + N dias" (N negativo pra dias passados), sempre a partir do dia de
// referência — é o que a aba Ta-da usa pra decidir o que é "hoje" e o que é "ontem".
export function dateKeyOffset(days = 0) {
  return shiftDateKey(todayKey(), days);
}

export function weekStartDate(d = brNow()) {
  const day = (d.getDay() + 6) % 7; // segunda = 0
  const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(d.getDate() - day);
  return m;
}
export const weekStartKey = (d = brNow()) => dateKey(weekStartDate(d));

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
export function fmtMin(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h e ${m} min`;
}
// "4h 35min" com as unidades menores e mais claras (cartões de Estatísticas): <b>4</b><i>h</i> <b>35</b><i>min</i>.
// Mesmo valor de fmtMin, só que em partes; os números ficam em <b> para a contagem animada (fx.js) agir só neles.
export function fmtMinRich(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `<b>${m}</b><i>min</i>`;
  if (m === 0) return `<b>${h}</b><i>h</i>`;
  return `<b>${h}</b><i>h</i> <b>${m}</b><i>min</i>`;
}
// versão em duas linhas para espaços estreitos (rótulos das colunas do gráfico): "1h" / "20 min"
export function fmtMinStacked(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h<br>${m} min`;
}
// Horário real de um ciclo salvo: "ts" é o instante em que o ciclo terminou (serverTimestamp);
// o início é calculado subtraindo a duração. Devolve null se o registro for antigo e não tiver ts.
export function sessionSpan(r) {
  const end = r?.ts?.toDate ? r.ts.toDate() : (r?.ts ? new Date(r.ts) : null);
  if (!end || isNaN(end)) return null;
  return { start: new Date(end.getTime() - (Number(r.minutes) || 0) * 60000), end };
}
// Um ciclo que atravessou a meia-noite (no fuso de referência) deve contar em DOIS dias.
// Recebe o instante em que terminou e a duração em minutos. Devolve null se coube inteiro no dia
// em que terminou; senão { prevKey, prevMin, endKey, endMin } (prevMin + endMin = minutes).
export function splitAtMidnight(endDate, minutes) {
  const r1 = (n) => Math.round(n * 10) / 10;
  const z = zonedParts(endDate);
  const endMin = z.hour * 60 + z.minute + z.second / 60; // quanto do ciclo cabe no dia em que terminou
  if (!(minutes > endMin)) return null;
  const endKey = `${z.year}-${pad(z.month)}-${pad(z.day)}`;
  const endPart = r1(Math.min(endMin, minutes));
  return { prevKey: shiftDateKey(endKey, -1), endKey, prevMin: r1(minutes - endPart), endMin: endPart };
}
export const fmtHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
// código de sala: 8 caracteres sorteados com o gerador criptográfico do navegador (antes eram 6 e
// vinham de Math.random(), que é previsível). Salas antigas de 6 caracteres continuam funcionando.
export function genCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 símbolos: 256 % 32 === 0, sem viés
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let s = ""; for (let i = 0; i < len; i++) s += chars[bytes[i] % 32];
  return s;
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Tudo que vem do Firestore pode ter sido escrito por OUTRA pessoa (nome de matéria, cor, foto…
// de quem está na sua sala). esc() protege texto; já cor e URL entram em atributos style/src,
// onde só uma validação por formato é segura. Qualquer coisa fora do formato vira o valor padrão.
export function safeColor(c, fallback = "#9AA6B5") {
  return typeof c === "string" && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : fallback;
}
export function safeUrl(u) {
  if (typeof u !== "string" || u.length > 600) return null;
  return /^https:\/\/[^\s"'<>()\\]+$/i.test(u) || /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(u) ? u : null;
}
// número finito dentro de um intervalo (para valores numéricos que vêm de outras pessoas)
export const safeNum = (n, min = 0, max = 1e6) => { n = Number(n); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0; };

// evita disparar uma escrita no Firestore a cada tecla/arraste — só grava
// depois que a pessoa parar de mexer por `wait` ms.
export function debounce(fn, wait = 600) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

let toastTimer;
// Todo aviso na tela (toast) também é falado para leitores de tela (VoiceOver, TalkBack, NVDA),
// uma vez só, pela região viva do a11y.js — o próprio #toast não é "vivo" para não repetir.
// { silent: true } quando quem chama já fez o seu próprio anúncio (ex.: fim do cronômetro).
// O tempo na tela cresce com o tamanho do texto, para dar tempo de ler (mínimo 2,4 s).
export function toast(msg, { silent = false } = {}) {
  const t = $("toast"); if (!t) return;
  t.textContent = msg; t.classList.add("on");
  const ms = Math.min(9000, Math.max(2400, 1200 + String(msg).length * 55));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), ms);
  if (!silent) announce(msg);
}

export function avatarHTML(p, { size = 28, badge = null } = {}) {
  const style = `width:${safeNum(size, 8, 200)}px;height:${safeNum(size, 8, 200)}px`;
  const photo = safeUrl(p.photo);
  const inner = photo
    ? `<img class="avatar" style="${style}" src="${esc(photo)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="avatar" style="${style};background:${safeColor(p.color, "#D8AD4E")}">${esc((p.name || "?").trim().slice(0, 1).toUpperCase())}</span>`;
  // badge "studying" = estudando uma matéria (bolinha cor do timer); "task" = fazendo uma
  // tarefa de rotina (status antigo, ainda aceito na Sala) — mesmo indicador, cor diferente por contexto
  const dot = badge ? `<span class="dotBadge ${badge === "studying" ? "studying" : badge === "task" ? "doingTask" : ""}"></span>` : "";
  return `<span class="avatarWrap">${inner}${dot}</span>`;
}

// aceita o formato antigo do campo "daily" (número) e o novo (objeto)
export function normDay(raw) {
  if (raw == null) return { total: 0, bySubject: {} };
  if (typeof raw === "number") return { total: raw, bySubject: { geral: raw } };
  return { total: raw.total || 0, bySubject: raw.bySubject || {} };
}
export function sumDaily(daily, pred) {
  return Object.entries(daily || {}).reduce((a, [k, v]) => (pred(k) ? a + normDay(v).total : a), 0);
}
// matérias de QUALQUER perfil (o meu ou o de um amigo), já com as removidas: as ativas vêm
// de `profile.subjects`; as que foram apagadas entram com o nome/cor guardados em
// `profile.removedSubjects`. Assim o gráfico/diário de um amigo mostra o nome certo mesmo
// depois de ele ter apagado a matéria (sem isso ela virava "Matéria removida").
export function subjectsWithArchive(profile) {
  const live = Array.isArray(profile?.subjects) ? profile.subjects : [];
  const archived = Object.entries(profile?.removedSubjects || {})
    .filter(([id]) => !live.some((s) => s.id === id))
    .map(([id, v]) => ({ id, name: String(v?.name || "Matéria"), color: v?.color }));
  return [...live, ...archived];
}

export function subjectById(id, list) {
  if (id === "geral" || !id) return GERAL;
  const src = list || store.subjects;
  const found = src.find((s) => s.id === id);
  if (found) return { ...found, color: safeColor(found.color) };
  // matéria já removida: se foi removida do PRÓPRIO usuário (não de um amigo, cujo
  // `list` já vem preenchido à parte), ainda temos o nome/cor guardados em
  // store.profile.removedSubjects — assim ela continua aparecendo certa nos gráficos
  // (últimos 7 dias, catálogo semanal, aprofundado…) em vez de virar "Matéria removida".
  const archived = !list && store.profile?.removedSubjects?.[id];
  if (archived) return { id, name: archived.name, color: safeColor(archived.color) };
  return { ...GERAL, id, name: "Matéria removida" };
}

// matéria de um ciclo do diário (users/{uid}/sessions). Usa o cadastro atual (ou o arquivo de
// removidas, via subjectById). Só se a matéria não existir mais em lugar nenhum é que usa o nome
// gravado junto do próprio ciclo (`subjectName`/`subjectColor`, a partir da 2.11.1). Ciclos antigos,
// sem esse nome, continuam como \"Matéria removida\".
export function sessionSubject(r, list) {
  const s = subjectById(r.subjectId, list);
  if (s.name !== "Matéria removida" || !r.subjectName) return s;
  return { id: r.subjectId, name: String(r.subjectName), color: safeColor(r.subjectColor) };
}

// streak: dias seguidos com estudo, terminando hoje ou ontem (aritmética de calendário: ver shiftDateKey)
export function computeStreak(daily) {
  const has = (k) => normDay((daily || {})[k]).total > 0;
  const today = todayKey();
  let cursor = today;
  if (!has(cursor)) {
    cursor = shiftDateKey(today, -1);
    if (!has(cursor)) return { days: 0, studiedToday: false };
  }
  let n = 0;
  while (has(cursor) && n < 36600) { n++; cursor = shiftDateKey(cursor, -1); }
  return { days: n, studiedToday: has(today) };
}

// maior sequência de dias seguidos já estudada (histórico completo, não só a atual)
export function longestStreakEver(daily) {
  const keys = Object.keys(daily || {}).filter((k) => normDay(daily[k]).total > 0).sort();
  if (keys.length === 0) return 0;
  let best = 1, run = 1;
  for (let i = 1; i < keys.length; i++) {
    run = daysBetweenKeys(keys[i - 1], keys[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

// dia com mais minutos estudados já registrado
export function bestDayEver(daily) {
  let bestKey = null, bestMin = 0;
  Object.entries(daily || {}).forEach(([k, v]) => {
    const t = normDay(v).total;
    if (t > bestMin) { bestMin = t; bestKey = k; }
  });
  return { key: bestKey, minutes: bestMin };
}

// soma dos minutos estudados nos últimos N dias (incluindo hoje)
export function lastNDaysTotal(daily, n) {
  let total = 0;
  const today = todayKey();
  for (let i = 0; i < n; i++) total += normDay((daily || {})[shiftDateKey(today, -i)]).total;
  return total;
}

// total de minutos por dia da semana (0=dom..6=sáb), histórico completo
export function weekdayTotals(daily) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  Object.entries(daily || {}).forEach(([k, v]) => {
    const wd = weekdayOfKey(k);
    if (isNaN(wd)) return;
    totals[wd] += normDay(v).total;
  });
  return totals;
}

// totais mensais (últimos `n` meses, incluindo o atual), por matéria
export function monthlyTotals(daily, n = 6) {
  const months = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = brNow(); dt.setDate(1); dt.setMonth(dt.getMonth() - i);
    months.push({ key: `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`, year: dt.getFullYear(), month: dt.getMonth(), total: 0, bySubject: {} });
  }
  const byKey = Object.fromEntries(months.map((m) => [m.key, m]));
  Object.entries(daily || {}).forEach(([k, v]) => {
    const mk = k.slice(0, 7);
    const bucket = byKey[mk];
    if (!bucket) return;
    const entry = normDay(v);
    bucket.total += entry.total;
    Object.entries(entry.bySubject || {}).forEach(([sid, m]) => { bucket.bySubject[sid] = (bucket.bySubject[sid] || 0) + m; });
  });
  return months;
}

// modal genérico reaproveitado pela nota de fim de ciclo e pela anotação de distração
export function openModal({ title, placeholder = "", value = "", confirmLabel = "Salvar", allowSkip = true, skipLabel = "Pular", chips = [], hint = "" }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modalWrap";
    wrap.innerHTML = `
      <div class="modalBox">
        <p class="modalTitle">${esc(title)}</p>
        ${hint ? `<p class="reflHint">${esc(hint)}</p>` : ""}
        ${chips.length ? `<div class="reflChips" role="group" aria-label="Começos de frase">${chips.map((c, i) => `<button type="button" data-chip="${i}">${esc(c)}</button>`).join("")}</div>` : ""}
        <textarea class="f modalInput" placeholder="${esc(placeholder)}" rows="3">${esc(value)}</textarea>
        <div class="modalBtns">
          ${allowSkip ? `<button class="ghost" data-act="skip">${esc(skipLabel)}</button>` : ""}
          <button class="primary" data-act="ok">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector(".modalInput");
    setTimeout(() => input.focus(), 30);
    // chips: botões que começam a frase (reflexão guiada). Escrever à mão continua livre.
    wrap.querySelectorAll("[data-chip]").forEach((b) => b.addEventListener("click", () => {
      const txt = chips[Number(b.dataset.chip)].replace(/^\S+\s/u, ""); // tira o emoji do começo
      input.value = input.value.trim() ? `${input.value.trim()}\n${txt} ` : `${txt} `;
      input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }));
    function close(val) { wrap.remove(); resolve(val); }
    wrap.querySelector('[data-act="ok"]').addEventListener("click", () => close(input.value.trim()));
    if (allowSkip) wrap.querySelector('[data-act="skip"]').addEventListener("click", () => close(null));
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(null); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) close(input.value.trim());
    });
  });
}

// dispara o download de um arquivo gerado na hora (ex: "Baixar meus dados") — sem
// precisar de backend, só Blob + um <a download> temporário
export function downloadFile(filename, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// desenha um seletor de cor "bolinhas + uma cor personalizada" dentro de `el` (um <div>), e
// liga os cliques. Reaproveitado por Ajustes → Matérias e pelas categorias de tarefa do
// Ta-da, pra manter os dois com a mesma cara e o mesmo leque de cores.
export function renderColorPicker(el, colors, picked, onPick) {
  picked = safeColor(picked, colors[0]);
  const isCustom = !colors.includes(picked);
  el.innerHTML = colors.map((c) =>
    `<button type="button" data-color="${c}" style="background:${c}" class="${picked === c ? "on" : ""}" title="${c}"></button>`
  ).join("") + `<input type="color" class="customColor ${isCustom ? "on" : ""}" title="Outra cor" value="${isCustom ? picked : colors[0]}">`;
  el.querySelectorAll("button[data-color]").forEach((b) => b.addEventListener("click", () => onPick(b.dataset.color)));
  el.querySelector(".customColor").addEventListener("input", (e) => onPick(e.target.value));
}
