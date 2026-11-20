# Alat Download Suno Ajaib — Versi Vercel (v8 — HP & PC)

Downloader Suno bernuansa Doraemon yang bisa dipakai langsung di **HP (Android / iPhone)** maupun **PC**: gate password, set token 1-klik lewat Bookmarklet HP atau F12 PC, load lagu per workspace/playlist dengan pagination **NEXT / PREV** penuh (20 lagu per halaman), grid responsif dengan tombol **DL** satuan + download batch, dan download by ID/URL. Hasil download berupa file **.m4a**.

## Perbaikan v8 (Support HP Android & iPhone)

- **Panduan ambil token di HP + tombol 1-klik**: Di dalam kotak `CARA AMBIL TOKEN` sekarang ada tab **📱 Di HP (Android / iPhone)** lengkap dengan tombol **COPY KODE BOOKMARKLET** (1 klik di `suno.com` langsung copy token tanpa F12) dan tab **💻 Di PC (F12)**.
- **Tombol `📋 PASTE & LOGIN`**: Di HP tinggal ketuk satu tombol untuk langsung menempel token dari clipboard dan memuat daftar workspace otomatis.
- **Tampilan & sentuhan ramah HP**: Input 16px (anti auto-zoom di iOS Safari), tombol lebih besar & gampang disentuh, padding aman untuk gesture bar (`safe-area-inset-bottom`), dan layout 1 kolom rapi di layar HP (2 kolom tablet, 3 kolom PC).

## Perbaikan v7 (Pagination NEXT/PREV penuh + Layout 3 Kolom)

- `api/feed.js` menarik 1 halaman (20 lagu) per klik `NEXT ›`/`‹ PREV` langsung ke Suno (`GET /api/project/{id}?page=1, 2, 3, ...`) dengan auto-fallback dan cache `PREV` di browser.

## Cara Deploy ke GitHub + Vercel

1. Extract file zip ini.
2. Upload `index.html` (atau semua isi folder) ke root repository GitHub kamu untuk menggantikan file lama.
3. Vercel akan otomatis deploy ulang.
