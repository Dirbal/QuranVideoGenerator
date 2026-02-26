<div align="center">

<img src="public/banner.png" alt="Quran Video Generator" width="100%" />

# ﷽

# Quran Video Generator | مُولِّد فيديو القرآن

**أنشئ فيديوهات قرآنية احترافية بتلاوات عذبة وخلفيات طبيعية**

**Create stunning Quranic videos with beautiful recitations and natural backgrounds**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![FFmpeg](https://img.shields.io/badge/FFmpeg-libass-green?style=for-the-badge&logo=ffmpeg)](https://ffmpeg.org/)
[![License](https://img.shields.io/badge/License-MIT-gold?style=for-the-badge)](LICENSE)

[العربية](#العربية) · [English](#english) · [Demo](#demo) · [Deploy](#deploy)

</div>

---

## العربية

### ✨ المميزات

- 🕌 **آيات قرآنية** — اختر أي سورة ونطاق آيات من القرآن الكريم
- 🎙️ **تلاوات متعددة** — أكثر من 20 قارئ بأصوات عذبة
- 🖋️ **10 خطوط عربية** — نسخ، رقعة، حديثة (كلها بحروف متصلة عبر HarfBuzz)
- 🎬 **خلفيات طبيعية** — طبيعة، محيط، سماء، صحراء، غابة (من Pixabay)
- 📖 **تفسير ميسّر** — عرض التفسير أسفل الآيات
- 📐 **أحجام متعددة** — 16:9 (يوتيوب)، 9:16 (ريلز/تيكتوك)، 1:1، 4:5
- 🎚️ **تحكم بالسطوع** — ضبط إضاءة الخلفية
- 🌐 **ثنائي اللغة** — واجهة عربية وإنجليزية

### 🛠️ التقنيات

| التقنية | الاستخدام |
|---|---|
| **Next.js 16** | الإطار الأساسي (App Router + Server Actions) |
| **FFmpeg + libass** | توليد الفيديو مع نص عربي متصل (HarfBuzz) |
| **ASS Subtitles** | تشكيل دقيق للنص العربي عبر محرك libass |
| **Quran API** | جلب الآيات والتلاوات والتفسير |
| **Pixabay API** | خلفيات فيديو طبيعية آمنة |

### 🏗️ التشكيل العربي — كيف يعمل؟

المشكلة: FFmpeg `drawtext` لا يدعم HarfBuzz — الحروف العربية تظهر منفصلة في الخطوط الحديثة.

**الحل:** نستخدم فلتر `subtitles` بدل `drawtext`:

```
drawtext (قديم — بدون HarfBuzz) → subtitles + ASS (جديد — مع HarfBuzz)
```

1. ننشئ ملف `.ass` (Advanced SubStation Alpha) بكل الآيات وأرقامها والتفسير
2. FFmpeg يعرض النص عبر **libass** الذي يحتوي على **HarfBuzz** مدمج
3. HarfBuzz يتكفل بالتشكيل: اتصال الحروف، التشكيل، المسافات — لكل الخطوط

---

## English

### ✨ Features

- 🕌 **Quranic Verses** — Select any Surah and ayah range
- 🎙️ **Multiple Reciters** — 20+ reciters with beautiful recitations
- 🖋️ **10 Arabic Fonts** — Naskh, Ruqaa, Modern (all with connected letters via HarfBuzz)
- 🎬 **Nature Backgrounds** — Nature, Ocean, Sky, Desert, Forest (from Pixabay)
- 📖 **Tafsir** — Optional simplified tafsir below verses
- 📐 **Multiple Ratios** — 16:9 (YouTube), 9:16 (Reels/TikTok), 1:1, 4:5
- 🎚️ **Brightness Control** — Adjust background dimming
- 🌐 **Bilingual** — Arabic & English UI

### 🛠️ Tech Stack

| Technology | Usage |
|---|---|
| **Next.js 16** | Full-stack framework (App Router + Server Actions) |
| **FFmpeg + libass** | Video generation with connected Arabic text (HarfBuzz) |
| **ASS Subtitles** | Precise Arabic text shaping via libass engine |
| **Quran API** | Verses, recitations, and tafsir data |
| **Pixabay API** | Safe nature background videos |

### 🏗️ Arabic Text Shaping — How it Works

The problem: FFmpeg `drawtext` doesn't support HarfBuzz — Arabic letters appear disconnected in modern fonts.

**The solution:** Use the `subtitles` filter instead of `drawtext`:

1. Generate an `.ass` (Advanced SubStation Alpha) subtitle file with verses, numbers, and tafsir
2. FFmpeg renders text via **libass** which has **HarfBuzz** built-in
3. HarfBuzz handles shaping: letter connections, diacritics, kerning — for ALL fonts

---

## Deploy

### Docker (Recommended)

```bash
git clone https://github.com/Dirbal/QuranVideoGenerator.git
cd QuranVideoGenerator
docker build -t quran-video .
docker run -p 3000:3000 -e PIXABAY_API_KEY=your_key quran-video
```

### Render (One-Click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

1. Fork this repo
2. Connect to Render
3. Set `PIXABAY_API_KEY` in environment variables
4. Deploy!

### Local Development

```bash
# Install dependencies
npm install

# Create .env.local
echo "PIXABAY_API_KEY=your_pixabay_api_key" > .env.local

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PIXABAY_API_KEY` | ✅ | Free API key from [pixabay.com](https://pixabay.com/api/docs/) |

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── generate/       # Video generation endpoint
│   │   ├── quran/           # Quran API proxy (chapters, verses, reciters, audio)
│   │   └── videos/          # Pixabay video search
│   ├── globals.css          # Design system
│   ├── layout.tsx           # Root layout
│   └── page.tsx             # Main page
├── components/
│   ├── FontSelector.tsx     # 10 Arabic fonts with preview
│   ├── BrightnessControl.tsx # Background dimming slider
│   ├── ThemeSelector.tsx    # Background theme picker
│   ├── ReciterSelector.tsx  # Reciter selection
│   └── ...                  # Other UI components
├── lib/
│   ├── ffmpeg.ts            # Video generation + Arabic reshaping + ASS subtitle engine
│   ├── quran-api.ts         # Quran.com API client
│   ├── pixabay.ts           # Pixabay video search
│   └── i18n.ts              # Arabic/English translations
public/
└── fonts/                   # Arabic font files (.ttf)
```

---

## License

MIT License — free to use, modify, and distribute.

---

<div align="center">

**بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ**

Made with ❤️ for the Ummah

</div>
