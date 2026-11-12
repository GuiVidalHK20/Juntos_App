import { db, doc, setDoc, updateDoc, getDoc, serverTimestamp, deleteField } from "./firebase.js";
import { store } from "./store.js";
import { $, toast, debounce } from "./utils.js";
import { WALL_LS_KEY } from "./constants.js";
import { motionAllowed } from "./fx.js";

/* aplica o papel de parede + decide automaticamente se o texto deve ficar
   claro ou escuro, combinando o brilho médio da foto com o quanto ela foi
   clareada pelo controle de "shade" — sem isso, fotos escuras deixariam o
   texto ilegível. */
export function applyWallpaper(dataUrl, shade = 55, luminance = null) {
  document.body.classList.toggle("haswall", !!dataUrl);
  if (!dataUrl) return;
  $("wallpaper").style.backgroundImage = `url(${dataUrl})`;
  // troca suave da imagem só se a pessoa não pediu "reduzir movimento"
  $("wallpaper").style.transition = motionAllowed() ? "opacity .5s ease" : "none";
  $("wallShade").style.background = `rgba(233,242,252,${(shade ?? 55) / 100})`;
  const lum = luminance ?? Number(localStorage.getItem(WALL_LS_KEY + ".lum") || 0.5);
  const effective = lum + (1 - lum) * ((shade ?? 55) / 100) * 0.9;
  document.body.setAttribute("data-contrast", effective > 0.55 ? "light" : "dark");
}

function averageLuminance(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 16; c.height = 16;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, 16, 16);
      let total = 0;
      try {
        const data = ctx.getImageData(0, 0, 16, 16).data;
        for (let i = 0; i < data.length; i += 4) {
          total += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        }
        resolve(total / (data.length / 4));
      } catch { resolve(0.5); }
    };
    img.onerror = () => resolve(0.5);
    img.src = dataUrl;
  });
}

function compressImage(file, maxSide, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function loadWallpaperFromCloud() {
  try {
    const d = await getDoc(doc(db, "wallpapers", store.me.uid));
    const img = d.exists() ? d.data().image : null;
    if (img) {
      localStorage.setItem(WALL_LS_KEY, img);
      const lum = await averageLuminance(img);
      localStorage.setItem(WALL_LS_KEY + ".lum", lum);
      applyWallpaper(img, store.profile?.wallShade ?? 55, lum);
      $("wallPreview").style.backgroundImage = `url(${img})`;
      $("wallClear").classList.remove("hide");
    }
  } catch {}
}

const saveShade = debounce(async (v) => {
  await updateDoc(doc(db, "users", store.me.uid), { wallShade: v }).catch(() => {});
}, 700);

export function initWallpaper() {
  applyWallpaper(localStorage.getItem(WALL_LS_KEY), Number(localStorage.getItem(WALL_LS_KEY + ".shade") || 55));

  $("wallPick").addEventListener("click", () => $("wallInput").click());
  $("wallInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast("Preparando a imagem…");
    try {
      const dataUrl = await compressImage(file, 1280, 0.68);
      const approxBytes = dataUrl.length * 0.75;
      const lum = await averageLuminance(dataUrl);
      localStorage.setItem(WALL_LS_KEY, dataUrl);
      localStorage.setItem(WALL_LS_KEY + ".lum", lum);
      applyWallpaper(dataUrl, Number($("wallShadeRange").value), lum);
      $("wallPreview").style.backgroundImage = `url(${dataUrl})`;
      $("wallClear").classList.remove("hide");
      if (approxBytes < 700 * 1024) {
        // guardado num documento separado: assim os amigos não baixam sua
        // foto de fundo toda vez que seu tempo de estudo é atualizado
        await setDoc(doc(db, "wallpapers", store.me.uid), { image: dataUrl, updatedAt: serverTimestamp() });
        await updateDoc(doc(db, "users", store.me.uid), { wallShade: Number($("wallShadeRange").value) });
        toast("Papel de parede salvo na sua conta.");
      } else {
        toast("Imagem grande: salva só neste aparelho.");
      }
    } catch { toast("Não consegui ler essa imagem."); }
    e.target.value = "";
  });

  $("wallClear").addEventListener("click", async () => {
    localStorage.removeItem(WALL_LS_KEY);
    localStorage.removeItem(WALL_LS_KEY + ".lum");
    document.body.classList.remove("haswall");
    $("wallPreview").style.backgroundImage = "";
    $("wallClear").classList.add("hide");
    await setDoc(doc(db, "wallpapers", store.me.uid), { image: deleteField() }, { merge: true }).catch(() => {});
    toast("Papel de parede removido.");
  });

  $("wallShadeRange").addEventListener("input", (e) => {
    const v = Number(e.target.value);
    localStorage.setItem(WALL_LS_KEY + ".shade", v);
    applyWallpaper(localStorage.getItem(WALL_LS_KEY), v);
    saveShade(v); // agrupa: só grava no Firestore depois que a pessoa solta o controle
  });
}

export function syncWallpaperUI(profile) {
  const wall = localStorage.getItem(WALL_LS_KEY);
  $("wallPreview").style.backgroundImage = wall ? `url(${wall})` : "";
  $("wallClear").classList.toggle("hide", !wall);
  $("wallShadeRange").value = profile.wallShade ?? 55;
  if (wall) applyWallpaper(wall, profile.wallShade ?? 55);
}
