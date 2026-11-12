export function makeSeed(todayKey, shift) {
  const seed = {};
  seed["users/u1"] = { name: "Teste", color: "#2FD9EE", roomCode: null, roomCodes: [], daily: {}, cfg: { focus: 25, short: 5, long: 15, cycles: 4 }, subjects: [{ id: "mat", name: "Matemática", color: "#2FD9EE" }], quickMsgs: [], soundOn: false, notifOn: false, theme: "dark", diarySharedWith: [], periodTotals: {}, removedSubjects: {}, tadaSharedWith: [], gratSharedWith: [], consent: { v: "1.2", at: Date.now() } };
  seed["users/u1/private/mind"] = {}; seed["users/u1/private/planner"] = {};
  for (let i = 0; i < 70; i++) {
    const k = shift(todayKey, -i); if (i % 3 === 2) continue;
    const items = Array.from({ length: 2 + (i % 5) }, (_, j) => ({ id: `w${i}_${j}`, t: `Conquista ${i}-${j}`, w: 1 + ((i + j) % 3), ts: 1700000000000 + i * 1e5 + j, ...(j === 0 && i % 4 === 0 ? { star: true } : {}) }));
    seed[`users/u1/tada/${k}`] = { date: k, items, wrap: i % 5 === 0 ? "dia bom" : "" };
    if (i % 4 === 0) seed[`users/u1/gratitude/${k}`] = { date: k, items: [{ id: `g${i}`, what: "algo bom", how: "", ts: 1 }] };
    seed["users/u1"].daily[k] = { total: 25 * (1 + (i % 4)), bySubject: { mat: 25 * (1 + (i % 4)) } };
  }
  // sessões (Diário e Horários): ~45 ciclos espalhados pelos últimos 25 dias, em várias horas
  const base = Date.parse(todayKey + "T15:00:00Z");
  for (let i = 0; i < 45; i++) {
    const dayAgo = Math.floor(i / 2), hour = [9, 11, 14, 16, 19, 21, 7, 23][i % 8];
    const ts = base - dayAgo * 864e5 - (15 - hour) * 36e5 + (i % 5) * 60000;
    seed[`users/u1/sessions/s${i}`] = { date: new Date(ts - 3 * 36e5).toISOString().slice(0, 10), ts, minutes: [25, 25, 50, 35, 25][i % 5], subject: i % 3 ? "mat" : "geral", note: i % 4 === 0 ? "revisão de exercícios" : "" };
  }
  return seed;
}
