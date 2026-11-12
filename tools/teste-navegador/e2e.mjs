import { openApp } from "./lib.mjs"; import { makeSeed } from "./seed.mjs";
const root = process.argv[2];
const br = new Date(Date.now() - 3 * 3600e3); const today = br.toISOString().slice(0, 10);
const shift = (k, n) => new Date(Date.parse(k + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const { page, errors, close } = await openApp(root, makeSeed(today, shift));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (name, cond, info = "") => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, info); } };
const ev = (f, ...a) => page.evaluate(f, ...a);
const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
const dbItems = (k) => ev((k) => { const d = window.__DBREAD?.(k); return d; }, today);
await sleep(1500);

console.log("cronômetro");
const c0 = await ev(() => document.getElementById("clock").textContent);
await click("#startBtn"); await sleep(2300);
const c1 = await ev(() => document.getElementById("clock").textContent);
ok("relógio anda", c0 !== c1, `${c0} → ${c1}`);
ok("botão pausar aparece", await ev(() => !document.getElementById("pauseBtn").classList.contains("hide")));
await click("#pauseBtn"); await sleep(300);
const c2 = await ev(() => document.getElementById("clock").textContent); await sleep(1200);
ok("pausa congela", c2 === await ev(() => document.getElementById("clock").textContent));
await click("#stopBtn").catch(() => {}); await sleep(300);

for (const vt of [true, false]) {
  console.log("abas " + (vt ? "(com View Transition)" : "(sem)"));
  await ev((vt) => { if (!vt) document.startViewTransition = undefined; }, vt);
  for (const tab of ["stats", "tada", "room", "timer", "settings"]) {
    if (tab === "settings") await click("#gearBtn"); else await click(`nav button[data-tab="${tab}"]`);
    await sleep(900);
    const st = await ev((tab) => ({ shown: [...document.querySelectorAll("main > section, #app > section")].filter((s) => !s.classList.contains("hide")).map((s) => s.id), on: [...document.querySelectorAll("nav button.on")].map((b) => b.dataset.tab), vt: document.documentElement.dataset.vt }), tab);
    ok(`${tab}: só a tela certa visível`, st.shown.length === 1 && st.shown[0] === "view-" + tab, JSON.stringify(st));
    ok(`${tab}: sem data-vt sobrando`, !st.vt, JSON.stringify(st));
  }
}
await click('nav button[data-tab="timer"]'); await sleep(500);

console.log("Done-list · Marcar");
await click('nav button[data-tab="tada"]'); await sleep(1500);
await click('.tdStyleBtn[data-s="marcar"]'); await sleep(700);
const first = await ev(() => { const b = document.querySelector(".qkBtn"); b.__mark = "mesmo"; return b.dataset.q; });
await click(`.qkBtn[data-q="${first}"]`); await sleep(400);
let st = await ev((q) => { const b = document.querySelector(`.qkBtn[data-q="${q}"]`); return { on: b.classList.contains("on"), pressed: b.getAttribute("aria-pressed"), same: b.__mark === "mesmo", anims: b.getAnimations().length }; }, first);
ok("marcou", st.on && st.pressed === "true", JSON.stringify(st));
ok("MESMO botão (não foi recriado)", st.same);
ok("mola rodando no botão", st.anims > 0, JSON.stringify(st));
await click(`.qkBtn[data-q="${first}"]`); await sleep(400);
st = await ev((q) => { const b = document.querySelector(`.qkBtn[data-q="${q}"]`); return { on: b.classList.contains("on"), pressed: b.getAttribute("aria-pressed") }; }, first);
ok("desmarcou (um clique = uma troca; sem ouvinte duplicado)", !st.on && st.pressed === "false", JSON.stringify(st));
await click('.tdStyleBtn[data-s="corrida"]'); await sleep(500);
await click('.tdStyleBtn[data-s="marcar"]'); await sleep(500);
await click(`.qkBtn[data-q="${first}"]`); await sleep(300);
ok("depois de trocar de estilo e voltar, ainda um clique = uma troca", await ev((q) => document.querySelector(`.qkBtn[data-q="${q}"]`).classList.contains("on"), first));
await click(`.qkBtn[data-q="${first}"]`); await sleep(300);

console.log("Done-list · Corrida");
await click('.tdStyleBtn[data-s="corrida"]'); await sleep(600);
const n0 = await ev(() => document.querySelectorAll("#tdList .tdRow[data-k]").length);
await click('.wChip[data-w="3"]'); await sleep(300);
ok("chip de peso 3 marcado", await ev(() => document.querySelector('.wChip[data-w="3"]').classList.contains("set") && !document.querySelector('.wChip[data-w="1"]').classList.contains("set")));
const marker = await ev(() => { const r = document.querySelector("#tdList .tdRow[data-k]"); if (r) r.__mark = "antiga"; return !!r; });
for (const t of ["Primeira nova", "Segunda nova", "Terceira nova"]) {
  await ev((t) => { document.getElementById("tdText").value = t; document.getElementById("tdAdd").click(); }, t); await sleep(500);
}
const rows = await ev(() => [...document.querySelectorAll("#tdList .tdRow[data-k]")].map((r) => ({ t: r.querySelector(".tdT").textContent, w: r.querySelector(".tdW").textContent, mark: r.__mark || null, k: r.dataset.k })));
ok("3 linhas novas", rows.length === n0 + 3, JSON.stringify(rows.map((r) => r.t)));
ok("mais nova em cima", rows[0].t === "Terceira nova", rows[0].t);
ok("peso 🌳 só no primeiro; depois volta para 🌱", rows.find((r) => r.t === "Primeira nova").w === "🌳" && rows[0].w === "🌱", JSON.stringify(rows.slice(0, 3)));
ok("linha antiga é o MESMO elemento", !marker || rows.some((r) => r.mark === "antiga"));
ok("todas as linhas têm chave", rows.every((r) => r.k));
await click("#tdList .tdRow[data-k] .tdBody"); await sleep(500);
ok("tocar na linha abre a edição (delegação)", await ev(() => !!document.querySelector(".modalWrap, .sheet, [role=dialog]")));
await ev(() => { document.querySelector(".modalWrap .sheetClose, .sheetClose, [data-a='close']")?.click(); document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); }); await sleep(400);

console.log("Done-list · Top 3 (destaques)");
await click('.tdStyleBtn[data-s="top3"]'); await sleep(700);
const stars = await ev(() => document.querySelectorAll("[data-star]").length);
ok("botões de estrela existem", stars >= 4, String(stars));
for (let i = 0; i < 4; i++) { await ev((i) => document.querySelectorAll("[data-star]")[i].click(), i); await sleep(300); }
const on = await ev(() => document.querySelectorAll("[data-star].on").length);
ok("no máximo 3 destaques", on === 3, String(on));
await ev(() => document.querySelector("[data-star].on").click()); await sleep(300);
ok("tirar um destaque funciona", await ev(() => document.querySelectorAll("[data-star].on").length) === 2);

console.log("Done-list · dias");
await click('.tdStyleBtn[data-s="corrida"]'); await sleep(500);
const dayBtns = await ev(() => document.querySelectorAll("#tdDays .dayBtn").length);
ok("7 dias na faixa", dayBtns === 7);
await ev(() => document.querySelectorAll("#tdDays .dayBtn")[4].click()); await sleep(500);
ok("trocar de dia marca o botão certo", await ev(() => document.querySelectorAll("#tdDays .dayBtn")[4].classList.contains("on") && document.querySelectorAll("#tdDays .dayBtn.on").length === 1));
const sel = await ev(() => document.querySelectorAll("#tdDays .dayBtn")[4].dataset.k);
await ev(() => { document.getElementById("tdText").value = "Registro de outro dia"; document.getElementById("tdAdd").click(); }); await sleep(600);
const wrote = await ev((sel) => window.__DBPEEK(sel), sel);
ok("registro foi para o dia selecionado", wrote.includes("Registro de outro dia"), JSON.stringify(wrote));
await ev(() => document.querySelectorAll("#tdDays .dayBtn")[6].click()); await sleep(500);

console.log("Histórico");
await click('.tdSubTab[data-tsub="hist"]'); await sleep(2500);
const h = await ev(() => ({ n: document.querySelector(".thN")?.textContent, hero: !!document.querySelector(".thHero"), cells: document.querySelectorAll(".thCell:not(.blank)").length }));
ok("Histórico renderiza (semana)", h.hero && h.cells === 7, JSON.stringify(h));
const expected = await ev(() => { const rows = [...document.querySelectorAll(".thCell")].map((c) => Number(c.querySelector("small")?.textContent) || 0); return rows.reduce((a, b) => a + b, 0); });
ok("contagem terminou no valor certo (soma do calendário = número do topo)", Number(h.n) === expected, `${h.n} vs ${expected}`);
await click('.thSeg [data-mode="month"]'); await sleep(2000);
ok("mês renderiza", await ev(() => document.querySelectorAll(".thCell:not(.blank)").length >= 28));
await click('.thSeg [data-mode="year"]'); await sleep(2500);
ok("ano renderiza barras", await ev(() => document.querySelectorAll(".thYear button").length === 12));
ok("ano: número do topo > 0", Number(await ev(() => document.querySelector(".thN")?.textContent)) > 0);
await click('.thSeg [data-mode="month"]'); await sleep(1500);
await ev(() => document.querySelector(".thCell:not(.blank):not(.off)").click()); await sleep(900);
ok("tocar num dia abre o detalhe", await ev(() => !!document.querySelector(".modalWrap, .sheet, [role=dialog]")));

console.log("modo Suave / sem movimento");
await ev(async () => { (await import("/js/fx.js")).applyFx("lite"); });
await click('nav button[data-tab="stats"]'); await sleep(600); await click('nav button[data-tab="tada"]'); await sleep(900);
ok("Suave: nenhuma animação do motion.js rodando", await ev(() => document.getAnimations().filter((a) => a.effect?.target?.closest?.("#tdList,#tdChips,#tdHead")).length === 0));
await ev(async () => { (await import("/js/fx.js")).applyFx("full"); });

console.log("Resumo do mês");
await click('nav button[data-tab="stats"]'); await sleep(1500);
await click("#wrappedBtn"); await sleep(3000);
let w = await ev(() => ({ chips: [...document.querySelectorAll(".wrChip")].map((b) => b.textContent), on: document.querySelector(".wrChip.on")?.dataset.ym, img: document.querySelector(".wrImg")?.naturalWidth, busy: document.querySelector(".wrBusy").hidden, pressed: document.querySelector(".wrChip.on")?.getAttribute("aria-pressed"), dlg: !!document.querySelector(".wrWrap[role=dialog]") }));
ok("abre com lista de meses (atual + anteriores com estudo)", w.chips.length >= 3 && w.chips[0] === "Este mês", JSON.stringify(w.chips));
ok("imagem 1080 de largura pronta", w.img === 1080 && w.busy, JSON.stringify(w));
ok("mês selecionado marcado (aria-pressed)", w.pressed === "true");
ok("é uma janela acessível", w.dlg);
const before = w.on;
await ev(() => [...document.querySelectorAll(".wrChip")].find((b) => !b.classList.contains("on") && b.textContent !== "Este mês").click()); await sleep(2500);
w = await ev(() => ({ on: document.querySelector(".wrChip.on")?.dataset.ym, alt: document.querySelector(".wrImg").alt, busy: document.querySelector(".wrBusy").hidden }));
ok("trocar de mês gera outra imagem", w.on !== before && w.busy && w.alt.includes("Resumo de"), JSON.stringify(w));
await click('.wrTheme[data-theme="aurora"]'); await sleep(2000);
ok("tema muda e fica salvo", await ev(() => localStorage.getItem("juntos.wrappedTheme") === "aurora" && document.querySelector('.wrTheme[data-theme="aurora"]').getAttribute("aria-pressed") === "true"));
await ev(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); document.querySelector(".wrWrap [data-close]")?.focus(); document.querySelector(".wrWrap").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); }); await sleep(400);
ok("Esc fecha a janela", await ev(() => !document.querySelector(".wrWrap")));

console.log("Estatísticas (cartões de vidro)");
await ev(() => { document.querySelector(".wrWrap")?.remove(); });
await click('nav button[data-tab="stats"]'); await sleep(1800);
let es = await ev(() => ({ trend: !!document.getElementById("trendChart") || !!document.querySelector("[class*=trend]"), cards: document.querySelectorAll("#statsSummary .gCard").length, icons: document.querySelectorAll("#statsSummary .gIco svg").length, tiles: [...document.querySelectorAll(".stat .v")].map((e) => e.textContent), nums: document.querySelectorAll(".stat .v b").length }));
ok("tendência removida", !es.trend);
ok("Resumo tem os cartões (sequência, constância, 4 totais, 7 dias, horários, catálogo = 9)", es.cards === 9, JSON.stringify(es));
ok("todos os cartões têm selo de ícone", es.icons >= 9, JSON.stringify(es));
ok("totais em partes (números em <b>)", es.nums >= 4 && es.tiles.every((t) => /\d/.test(t)), JSON.stringify(es.tiles));
await click('#bars .col[data-i="2"]'); await sleep(200);
let br2 = await ev(() => ({ on: document.querySelector("#bars .col.on")?.dataset.i, pressed: document.querySelectorAll('#bars .col[aria-pressed="true"]').length, read: document.getElementById("barsReadout").textContent }));
ok("tocar numa coluna a seleciona e mostra a leitura", br2.on === "2" && br2.pressed === 1 && br2.read.includes("·"), JSON.stringify(br2));
await click("#consistencyPanel .consDay:nth-child(5)"); await sleep(200);
ok("tocar num dia da constância mostra o tempo", await ev(() => /·/.test(document.getElementById("consReadout").textContent) && !!document.querySelector(".consDay.sel")));
for (const [sub, sel, n] of [["diario", "#statsHistory .gCard", 1], ["horarios", "#statsHours .hxKpi.gCard", 4], ["aprofundado", "#recordCards .recordCard.gCard", 4]]) {
  await click(`.statsSubTab[data-sub="${sub}"]`); await sleep(1800);
  const c = await ev((sel) => document.querySelectorAll(sel).length, sel);
  ok(`sub-aba ${sub}: cartões novos presentes`, c >= n, `${c} < ${n}`);
}
await click('.statsSubTab[data-sub="resumo"]'); await sleep(500);

const real = errors.filter((e) => !e.includes("ERR_FAILED"));
console.log(real.length ? "ERROS:\n" + real.join("\n") : "sem erros no console");
console.log(`\n${pass} ok · ${fail} falhas`);
await close(); process.exit(fail || real.length ? 1 : 0);
