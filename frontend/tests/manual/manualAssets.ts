// Synthetic assets for the manual figures: stimulus images (rendered from invented HTML) and the
// experiment folders chosen in the project wizard. Nothing here comes from real participants or SAIO.
import type { Browser } from "@playwright/test"
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(process.cwd(), "..")

export const OUT_DIR = path.join(root, "output", "manual", "figuras")
export const FIGURES_DIR = path.join(root, "manual", "figuras")
export const STIMULI_DIR = path.join(OUT_DIR, "estimulos")
export const HEATMAP_DIR = path.join(OUT_DIR, "mapas-de-calor")
export const FOLDER_FULL = path.join(OUT_DIR, "carpeta-demo", "Estudio de atención visual")
export const FOLDER_NO_VIDEOS = path.join(OUT_DIR, "carpeta-demo-sin-videos", "Estudio de atención visual")
export const FOLDER_NO_CSV = path.join(OUT_DIR, "carpeta-demo-sin-csv", "Estudio de atención visual")

export const STIMULUS_FILES = {
  home: path.join(STIMULI_DIR, "Página principal.png"),
  offer: path.join(STIMULI_DIR, "Oferta destacada.png"),
  video: path.join(STIMULI_DIR, "Video de campaña.png"),
} as const

const baseCss = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1280px; height: 720px; overflow: hidden; font-family: "Segoe UI", Arial, sans-serif; }
`

// A made-up web page: navigation, hero banner and three product cards.
const homeHtml = `<!doctype html><meta charset="utf-8"><style>${baseCss}
  body { background: #f6f1e7; color: #2b2a28; }
  .nav { height: 72px; background: #fff; display: flex; align-items: center; padding: 0 56px; gap: 36px; border-bottom: 1px solid #e4dccb; }
  .logo { font-weight: 800; font-size: 26px; color: #1f6f66; letter-spacing: .5px; }
  .nav span { font-size: 17px; color: #5b564c; }
  .nav .cart { margin-left: auto; background: #1f6f66; color: #fff; padding: 10px 22px; border-radius: 22px; font-size: 16px; }
  .hero { margin: 36px 56px 0; height: 300px; border-radius: 22px; background: linear-gradient(115deg, #1f6f66 0%, #2c9a8b 55%, #f2b45a 100%); color: #fff; padding: 52px 64px; position: relative; overflow: hidden; }
  .hero h1 { font-size: 46px; line-height: 1.12; max-width: 560px; }
  .hero p { margin-top: 16px; font-size: 20px; max-width: 470px; opacity: .95; }
  .hero .btn { display: inline-block; margin-top: 26px; background: #fff; color: #1f6f66; padding: 14px 34px; border-radius: 28px; font-weight: 700; font-size: 18px; }
  .hero .cup { position: absolute; right: 90px; top: 50px; width: 190px; height: 190px; border-radius: 50%; background: #fff3dc; box-shadow: 0 0 0 26px rgba(255,255,255,.18); }
  .hero .cup::after { content: ""; position: absolute; left: 44px; top: 44px; width: 102px; height: 102px; border-radius: 50%; background: #7a4a2b; }
  .cards { display: flex; gap: 28px; margin: 34px 56px 0; }
  .card { flex: 1; background: #fff; border-radius: 16px; padding: 20px; border: 1px solid #e4dccb; }
  .card .img { height: 120px; border-radius: 10px; margin-bottom: 14px; }
  .card h3 { font-size: 20px; } .card p { font-size: 15px; color: #6b665b; margin-top: 6px; } .card b { display: block; margin-top: 10px; color: #1f6f66; font-size: 18px; }
</style>
<div class="nav"><div class="logo">AURORA CAFÉ</div><span>Tienda</span><span>Origen</span><span>Suscripción</span><span>Blog</span><div class="cart">Carrito (2)</div></div>
<div class="hero"><h1>Café de origen, tostado esta semana</h1><p>Elige tu molienda y recíbelo en casa en dos días.</p><div class="btn">Armar mi pedido</div><div class="cup"></div></div>
<div class="cards">
  <div class="card"><div class="img" style="background:#e7c9a0"></div><h3>Huila suave</h3><p>Notas de panela y cacao</p><b>$ 32.000</b></div>
  <div class="card"><div class="img" style="background:#b9d9cf"></div><h3>Nariño brillante</h3><p>Notas de cítricos y flores</p><b>$ 35.000</b></div>
  <div class="card"><div class="img" style="background:#f2c3a7"></div><h3>Tolima intenso</h3><p>Notas de nuez y caramelo</p><b>$ 30.000</b></div>
</div>`

// A made-up advertisement: big offer, product shapes and a call to action.
const offerHtml = `<!doctype html><meta charset="utf-8"><style>${baseCss}
  body { background: #fff4e0; color: #3b2314; position: relative; }
  .band { position: absolute; left: 0; top: 0; width: 520px; height: 720px; background: #d94f2b; }
  .tag { position: absolute; left: 60px; top: 70px; color: #fff; font-weight: 800; font-size: 30px; letter-spacing: 3px; }
  .big { position: absolute; left: 60px; top: 130px; color: #fff; font-weight: 900; font-size: 150px; line-height: .95; }
  .sub { position: absolute; left: 60px; top: 440px; color: #ffe9cf; font-size: 28px; width: 380px; line-height: 1.3; }
  .cta { position: absolute; left: 60px; top: 580px; background: #fff; color: #d94f2b; font-weight: 800; font-size: 26px; padding: 16px 40px; border-radius: 34px; }
  .bag { position: absolute; left: 650px; top: 150px; width: 250px; height: 380px; background: #7a4a2b; border-radius: 22px; box-shadow: 14px 14px 0 rgba(0,0,0,.12); }
  .bag::before { content: "AURORA"; position: absolute; left: 0; right: 0; top: 150px; text-align: center; color: #ffe9cf; font-weight: 800; font-size: 30px; letter-spacing: 3px; }
  .bag2 { position: absolute; left: 930px; top: 220px; width: 220px; height: 330px; background: #1f6f66; border-radius: 22px; box-shadow: 14px 14px 0 rgba(0,0,0,.12); }
  .bag2::before { content: "AURORA"; position: absolute; left: 0; right: 0; top: 130px; text-align: center; color: #e2f3ef; font-weight: 800; font-size: 26px; letter-spacing: 3px; }
  .price { position: absolute; left: 700px; top: 575px; font-size: 34px; font-weight: 700; } .price s { color: #9a8472; font-weight: 400; margin-right: 18px; }
  .seal { position: absolute; left: 1090px; top: 90px; width: 130px; height: 130px; border-radius: 50%; background: #f2b45a; color: #3b2314; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 800; font-size: 22px; transform: rotate(10deg); }
</style>
<div class="band"></div><div class="tag">SOLO ESTA SEMANA</div><div class="big">2×1</div>
<div class="sub">Lleva dos bolsas de café y paga solo una.</div><div class="cta">Aprovechar oferta</div>
<div class="bag"></div><div class="bag2"></div><div class="price"><s>$ 64.000</s>$ 32.000</div><div class="seal">envío<br>gratis</div>`

// A frame of an invented campaign video: dark scene with a play mark.
const videoHtml = `<!doctype html><meta charset="utf-8"><style>${baseCss}
  body { background: linear-gradient(135deg, #17324a 0%, #1f6f66 60%, #f2b45a 130%); color: #fff; position: relative; }
  .t { position: absolute; left: 90px; top: 130px; font-size: 64px; font-weight: 800; line-height: 1.1; width: 720px; }
  .s { position: absolute; left: 90px; top: 360px; font-size: 26px; opacity: .9; width: 640px; }
  .play { position: absolute; right: 150px; top: 230px; width: 220px; height: 220px; border-radius: 50%; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; }
  .play::after { content: ""; border-left: 70px solid #fff; border-top: 42px solid transparent; border-bottom: 42px solid transparent; margin-left: 18px; }
  .bar { position: absolute; left: 60px; right: 60px; bottom: 50px; height: 8px; background: rgba(255,255,255,.3); border-radius: 4px; }
  .bar::after { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 34%; background: #f2b45a; border-radius: 4px; }
</style>
<div class="t">Un café para cada mañana</div><div class="s">Campaña de otoño · 30 segundos</div><div class="play"></div><div class="bar"></div>`

async function render(browser: Browser, html: string, file: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.setContent(html)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: file })
  await context.close()
}

// Renders the three stimuli once (delete output/manual/figuras/estimulos to force a new render).
async function ensureStimuli(browser: Browser) {
  fs.mkdirSync(STIMULI_DIR, { recursive: true })
  if (!fs.existsSync(STIMULUS_FILES.home)) await render(browser, homeHtml, STIMULUS_FILES.home)
  if (!fs.existsSync(STIMULUS_FILES.offer)) await render(browser, offerHtml, STIMULUS_FILES.offer)
  if (!fs.existsSync(STIMULUS_FILES.video)) await render(browser, videoHtml, STIMULUS_FILES.video)
}

const csv = [
  "Grabación : 1020304050 | Rec 1",
  "Frecuencia del archivo : 10 Hz",
  "Time;Bandwidth / X;Bandwidth / Y;Scenario 1;",
  "0;480;540;Página principal;",
  "100;492;538;Página principal;",
  "200;510;536;Página principal;",
].join("\n")

function writeFolder(folder: string, options: { videos: boolean; csv: boolean }) {
  fs.rmSync(path.dirname(folder), { recursive: true, force: true })
  fs.mkdirSync(path.join(folder, "Images"), { recursive: true })
  if (options.csv) fs.writeFileSync(path.join(folder, "datos.csv"), csv, "utf8")
  fs.copyFileSync(STIMULUS_FILES.home, path.join(folder, "Images", "Página principal.png"))
  fs.copyFileSync(STIMULUS_FILES.offer, path.join(folder, "Images", "Oferta destacada.png"))
  if (options.videos) {
    fs.mkdirSync(path.join(folder, "Videos"), { recursive: true })
    // Only the name matters to the browser: the structure is read from the paths.
    fs.writeFileSync(path.join(folder, "Videos", "Video de campaña.mp4"), "video sintetico")
  }
  const acquisition = [
    ["1020304050", "Página principal"],
    ["1030405060", "Página principal"],
    ["1040506070", "Página principal"],
  ]
  for (const [subject, scenario] of acquisition) {
    const dir = path.join(folder, "Acquisition", `Sujet_${subject}_Scenario_${scenario}_Rec1`)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "EyeTech.dat"), "")
  }
}

export async function ensureAssets(browser: Browser) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(FIGURES_DIR, { recursive: true })
  await ensureStimuli(browser)
  // The folders are rebuilt each run so they never drift from this file.
  writeFolder(FOLDER_FULL, { videos: true, csv: true })
  writeFolder(FOLDER_NO_VIDEOS, { videos: false, csv: true })
  writeFolder(FOLDER_NO_CSV, { videos: true, csv: false })
}
