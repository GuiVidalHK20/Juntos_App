/* Ícones de traço (24×24) para a aba Estatísticas (2.24): leves, herdam a cor do texto (currentColor) e
   não pedem nenhuma biblioteca. Uso: icon("clock") → string <svg>; ou <span data-ico="clock"></span> + hydrateIcons(). */
const P = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bars: '<path d="M5.5 19.5v-7M12 19.5v-14M18.5 19.5v-9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M8 3v4M16 3v4M3.5 10.5h17"/>',
  trophy: '<path d="M8 4h8v5.5a4 4 0 0 1-8 0V4z"/><path d="M8 6H5.2a1.7 1.7 0 0 0-.2 3.4c.5.4 1.7.6 3 .6M16 6h2.8a1.7 1.7 0 0 1 .2 3.4c-.5.4-1.7.600-3 .600M12 13.5V17M8.5 20.5h7M10 17h4"/>',
  flame: '<path d="M12 3.2c.6 3.3 4.8 5.2 4.8 9.8a4.8 4.8 0 0 1-9.6 0c0-1.8.8-3 1.8-3.9.2 1.2.9 2 1.9 2.2-.4-3 .2-5.6 1.1-8.1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
  star: '<path d="M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6 7 19.25l.95-5.6L3.9 9.7l5.6-.8L12 3.8z"/>',
  medal: '<circle cx="12" cy="9" r="5.2"/><path d="M8.8 13.6L7 20.5l5-2.8 5 2.8-1.8-6.9"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".6"/>',
  users: '<circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 19.8a6.2 6.2 0 0 1 12.4 0M16 5.3a3.4 3.4 0 0 1 0 6.4M18.4 14.2a6.2 6.2 0 0 1 2.8 5.6"/>',
  grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.8"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.8"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.8"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.7" cy="6.5" r=".7"/><circle cx="4.7" cy="12" r=".7"/><circle cx="4.7" cy="17.5" r=".7"/>',
  growth: '<path d="M3.5 17l5.2-5.2 3.8 3.8L20.5 7.5"/><path d="M15 7.5h5.5V13"/>',
  hourglass: '<path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 8 5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 5-8 8.5"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>'
};

export function icon(name) {
  return P[name] ? `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${P[name]}</svg>` : "";
}
// preenche os <span data-ico="nome"> escritos no HTML (só os que ainda estão vazios)
export function hydrateIcons(root = document) {
  root.querySelectorAll("[data-ico]").forEach((el) => { if (!el.firstChild) el.innerHTML = icon(el.dataset.ico); });
}
