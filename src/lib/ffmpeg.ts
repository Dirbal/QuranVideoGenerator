import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import { execSync } from 'child_process';

// Use system FFmpeg (Docker/Linux) if available, else npm package (local dev)
function findBinary(name: string, npmPkg: string): string {
    try {
        // Works on both Linux and Windows
        const cmd = process.platform === 'win32' ? `where ${name}` : `command -v ${name}`;
        const sysPath = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim().split(/\r?\n/)[0];
        if (sysPath) return sysPath;
    } catch { /* not in PATH */ }
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require(npmPkg).path;
    } catch { /* not installed */ }
    return name;
}

ffmpeg.setFfmpegPath(findBinary('ffmpeg', '@ffmpeg-installer/ffmpeg'));
ffmpeg.setFfprobePath(findBinary('ffprobe', '@ffprobe-installer/ffprobe'));

export interface VerseOverlay {
    text: string;
    tafsirText?: string;
    audioUrl: string;
    verseKey: string;
}

interface AudioInfo {
    duration: number;
    filePath: string;
}

// ─── Arabic Reshaper (built-in) ───
const ARABIC_MAP: Record<number, [number, number | null, number | null, number | null]> = {
    0x0621: [0xFE80, null, null, null],
    0x0622: [0xFE81, null, null, 0xFE82],
    0x0623: [0xFE83, null, null, 0xFE84],
    0x0624: [0xFE85, null, null, 0xFE86],
    0x0625: [0xFE87, null, null, 0xFE88],
    0x0626: [0xFE89, 0xFE8B, 0xFE8C, 0xFE8A],
    0x0627: [0xFE8D, null, null, 0xFE8E],
    0x0671: [0xFB50, null, null, 0xFB51],  // Alef Wasla — critical for Quranic text
    0x0628: [0xFE8F, 0xFE91, 0xFE92, 0xFE90],
    0x0629: [0xFE93, null, null, 0xFE94],
    0x062A: [0xFE95, 0xFE97, 0xFE98, 0xFE96],
    0x062B: [0xFE99, 0xFE9B, 0xFE9C, 0xFE9A],
    0x062C: [0xFE9D, 0xFE9F, 0xFEA0, 0xFE9E],
    0x062D: [0xFEA1, 0xFEA3, 0xFEA4, 0xFEA2],
    0x062E: [0xFEA5, 0xFEA7, 0xFEA8, 0xFEA6],
    0x062F: [0xFEA9, null, null, 0xFEAA],
    0x0630: [0xFEAB, null, null, 0xFEAC],
    0x0631: [0xFEAD, null, null, 0xFEAE],
    0x0632: [0xFEAF, null, null, 0xFEB0],
    0x0633: [0xFEB1, 0xFEB3, 0xFEB4, 0xFEB2],
    0x0634: [0xFEB5, 0xFEB7, 0xFEB8, 0xFEB6],
    0x0635: [0xFEB9, 0xFEBB, 0xFEBC, 0xFEBA],
    0x0636: [0xFEBD, 0xFEBF, 0xFEC0, 0xFEBE],
    0x0637: [0xFEC1, 0xFEC3, 0xFEC4, 0xFEC2],
    0x0638: [0xFEC5, 0xFEC7, 0xFEC8, 0xFEC6],
    0x0639: [0xFEC9, 0xFECB, 0xFECC, 0xFECA],
    0x063A: [0xFECD, 0xFECF, 0xFED0, 0xFECE],
    0x0640: [0x0640, 0x0640, 0x0640, 0x0640],
    0x0641: [0xFED1, 0xFED3, 0xFED4, 0xFED2],
    0x0642: [0xFED5, 0xFED7, 0xFED8, 0xFED6],
    0x0643: [0xFED9, 0xFEDB, 0xFEDC, 0xFEDA],
    0x0644: [0xFEDD, 0xFEDF, 0xFEE0, 0xFEDE],
    0x0645: [0xFEE1, 0xFEE3, 0xFEE4, 0xFEE2],
    0x0646: [0xFEE5, 0xFEE7, 0xFEE8, 0xFEE6],
    0x0647: [0xFEE9, 0xFEEB, 0xFEEC, 0xFEEA],
    0x0648: [0xFEED, null, null, 0xFEEE],
    0x0649: [0xFEEF, null, null, 0xFEF0],
    0x064A: [0xFEF1, 0xFEF3, 0xFEF4, 0xFEF2],
    // Extended Arabic letters (appear in tafsir/Quran variants)
    0x06CC: [0xFBFC, 0xFBFE, 0xFBFF, 0xFBFD],  // Farsi Yeh (ی)
    0x06C0: [0xFBA4, null, null, 0xFBA5],         // Heh with Yeh above
};

const LAM_ALEF_MAP: Record<number, [number, number]> = {
    0x0622: [0xFEF5, 0xFEF6],
    0x0623: [0xFEF7, 0xFEF8],
    0x0625: [0xFEF9, 0xFEFA],
    0x0627: [0xFEFB, 0xFEFC],
    0x0671: [0xFEFB, 0xFEFC],  // Alef Wasla — uses same ligature as regular Alef
};

const TRANSPARENT = new Set([
    0x0610, 0x0612, 0x0613, 0x0614, 0x0615,
    0x064B, 0x064C, 0x064D, 0x064E, 0x064F,
    0x0650, 0x0651, 0x0652, 0x0653, 0x0654,
    0x0655, 0x0656, 0x0657, 0x0658, 0x0670,
    0x06D6, 0x06D7, 0x06D8, 0x06D9, 0x06DA,
    0x06DB, 0x06DC, 0x06DF, 0x06E0, 0x06E1,
    0x06E2, 0x06E3, 0x06E4, 0x06E7, 0x06E8,
    0x06EA, 0x06EB, 0x06EC, 0x06ED,
]);

function canConnectAfter(code: number): boolean {
    const m = ARABIC_MAP[code];
    return !!m && (m[1] !== null || m[2] !== null);
}

function canConnectBefore(code: number): boolean {
    const m = ARABIC_MAP[code];
    return !!m && (m[2] !== null || m[3] !== null);
}

function reshapeArabicText(input: string): string {
    let shaped = '';
    for (let i = 0; i < input.length; i++) {
        const current = input.charCodeAt(i);
        if (!(current in ARABIC_MAP)) { shaped += input[i]; continue; }

        let prevCode: number | null = null;
        for (let p = i - 1; p >= 0; p--) { if (!TRANSPARENT.has(input.charCodeAt(p))) { prevCode = input.charCodeAt(p); break; } }

        let nextCode: number | null = null;
        let nextIdx = -1;
        for (let n = i + 1; n < input.length; n++) { if (!TRANSPARENT.has(input.charCodeAt(n))) { nextCode = input.charCodeAt(n); nextIdx = n; break; } }

        const prevConnects = prevCode !== null && prevCode in ARABIC_MAP && canConnectAfter(prevCode);
        const nextConnects = nextCode !== null && nextCode in ARABIC_MAP && canConnectBefore(nextCode);

        if (current === 0x0644 && nextCode !== null && nextCode in LAM_ALEF_MAP) {
            const combo = LAM_ALEF_MAP[nextCode];
            shaped += String.fromCharCode(prevConnects ? combo[1] : combo[0]);
            i = nextIdx;
            continue;
        }

        const m = ARABIC_MAP[current];
        if (prevConnects && nextConnects && m[2] !== null) shaped += String.fromCharCode(m[2]);
        else if (prevConnects && m[3] !== null) shaped += String.fromCharCode(m[3]);
        else if (nextConnects && m[1] !== null) shaped += String.fromCharCode(m[1]);
        else shaped += String.fromCharCode(m[0]);
    }
    return shaped;
}

/**
 * Reverse string while keeping combining marks (tashkeel) attached to base chars.
 * Groups [base + following diacritics] then reverses groups.
 * NO bracket mirroring — reversal already puts brackets in correct visual order
 * for FFmpeg's LTR renderer.
 */
function reverseKeepDiacritics(text: string): string {
    const clusters: string[] = [];
    let current = '';
    for (const char of text) {
        const code = char.charCodeAt(0);
        const isCombining = TRANSPARENT.has(code) ||
            (code >= 0x0300 && code <= 0x036F) ||
            (code >= 0x0610 && code <= 0x061A) ||
            (code >= 0x064B && code <= 0x065F) ||
            code === 0x0670 ||
            (code >= 0x06D6 && code <= 0x06ED) ||
            (code >= 0xFE20 && code <= 0xFE2F);
        if (isCombining && current) {
            current += char;
        } else {
            if (current) clusters.push(current);
            current = char;
        }
    }
    if (current) clusters.push(current);
    return clusters.reverse().join('');
}

/**
 * Strip invisible Unicode characters that could interfere with rendering.
 */
function normalizeArabicText(text: string): string {
    return text
        .replace(/\u200C/g, '')
        .replace(/\u200D/g, '')
        .replace(/\u200B/g, '')
        .replace(/\u2060/g, '')
        .replace(/\uFEFF/g, '')
        .replace(/\u00AD/g, '')
        .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
        .replace(/\u0640{2,}/g, '\u0640');
}

/**
 * Fonts that contain Arabic Presentation Forms B glyphs (FE70-FEFF).
 * Only these fonts can use the full reshape pipeline.
 * Modern fonts (Cairo, Tajawal, etc.) lack these glyphs → show squares if reshaped.
 */
const FONTS_WITH_PRES_FORMS = new Set([
    'Amiri.ttf', 'Amiri-Bold.ttf',
    'NotoNaskhArabic.ttf',
]);

/**
 * Reshape Arabic text for FFmpeg drawtext.
 * - Fonts WITH Presentation Forms: normalize → reshape → reverse (connected letters)
 * - Fonts WITHOUT: normalize → reverse only (isolated but visible)
 */
function reshapeForFFmpeg(text: string, fontFile: string): string {
    const normalized = normalizeArabicText(text);
    if (FONTS_WITH_PRES_FORMS.has(fontFile)) {
        const reshaped = reshapeArabicText(normalized);
        return reverseKeepDiacritics(reshaped);
    }
    // Modern font — keep original Unicode, just reverse for LTR rendering
    return reverseKeepDiacritics(normalized);
}
// ─── End Arabic Reshaper ───

async function downloadFile(url: string, destPath: string): Promise<void> {
    const writer = fs.createWriteStream(destPath);
    const response = await axios.get(url, { responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

function getAudioDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) reject(err);
            else resolve(metadata.format.duration || 5);
        });
    });
}

function escapeFFmpegText(text: string): string {
    return text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/:/g, '\\:')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/%/g, '%%')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,');
}

/** Count visible characters (ignore Arabic diacritics/tashkeel) */
function visibleLength(text: string): number {
    let count = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (!TRANSPARENT.has(code)) count++;
    }
    return count;
}

/** Split text into lines at word boundaries, ignoring diacritics in width calculation */
function splitIntoLines(text: string, maxVisibleChars: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';
    let currentVisLen = 0;
    for (const word of words) {
        const wordVisLen = visibleLength(word);
        if (currentVisLen + wordVisLen + 1 > maxVisibleChars && currentLine) {
            lines.push(currentLine.trim());
            currentLine = word;
            currentVisLen = wordVisLen;
        } else {
            currentLine += (currentLine ? ' ' : '') + word;
            currentVisLen += (currentVisLen > 0 ? 1 : 0) + wordVisLen;
        }
    }
    if (currentLine.trim()) lines.push(currentLine.trim());
    return lines;
}

/** Adaptive font size based on visible text length and video width */
function getAdaptiveFontSize(text: string, w: number): number {
    const vLen = visibleLength(text);
    const base = w >= 1280 ? 52 : w >= 720 ? 42 : 34;
    if (vLen < 30) return base;
    if (vLen < 60) return Math.round(base * 0.82);
    if (vLen < 100) return Math.round(base * 0.68);
    if (vLen < 150) return Math.round(base * 0.56);
    return Math.round(base * 0.48);
}

/** Build fade alpha expression for FFmpeg drawtext */
function buildFadeAlpha(start: number, fadeIn: number, fadeOutStart: number, end: number): string {
    return `alpha='if(lt(t\\,${fadeIn})\\,(t-${start})/0.5\\,if(gt(t\\,${fadeOutStart})\\,1-(t-${fadeOutStart})/0.4\\,1))'`;
}

/** Build enable expression for FFmpeg drawtext */
function buildEnable(start: number, end: number): string {
    return `enable='between(t\\,${start}\\,${end})'`;
}

export async function generateVideo(
    verses: VerseOverlay[],
    backgroundVideoUrl: string,
    dimOpacity: number = 0.5,
    width: number = 1280,
    height: number = 720,
    fontFile: string = 'Amiri.ttf',
    onProgress?: (percent: number) => void
): Promise<string> {
    const tmpDir = path.join(os.tmpdir(), 'quran-video-' + uuidv4());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
        // 1) Download background video
        const bgPath = path.join(tmpDir, 'background.mp4');
        await downloadFile(backgroundVideoUrl, bgPath);

        // 2) Download all audio files and get durations
        const audioInfos: AudioInfo[] = [];
        for (let i = 0; i < verses.length; i++) {
            const audioPath = path.join(tmpDir, `audio_${i}.mp3`);
            await downloadFile(verses[i].audioUrl, audioPath);
            const duration = await getAudioDuration(audioPath);
            audioInfos.push({ duration, filePath: audioPath });
        }

        // 3) Create audio concat list
        const concatList = path.join(tmpDir, 'audio_list.txt');
        const listContent = audioInfos
            .map((a) => `file '${a.filePath.replace(/\\/g, '/')}'`)
            .join('\n');
        fs.writeFileSync(concatList, listContent);

        // 4) Concat all audio
        const mergedAudio = path.join(tmpDir, 'merged_audio.mp3');
        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(concatList)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .outputOptions(['-c', 'copy'])
                .output(mergedAudio)
                .on('end', () => resolve())
                .on('error', (e) => reject(e))
                .run();
        });

        const totalDuration = audioInfos.reduce((s, a) => s + a.duration, 0);

        // 5) Build ASS subtitle file — libass has HarfBuzz for proper Arabic shaping
        let cumulativeTime = 0;

        // Build font path from project's public/fonts/ directory
        const rawFontPath = path.join(process.cwd(), 'public', 'fonts', fontFile);
        const fontName = fontFile.replace(/\.(ttf|otf|woff2?)$/i, '').replace(/-/g, ' ');

        // Wider lines = more natural text flow
        const maxCharsPerLine = width >= 1280 ? 55 : width >= 720 ? 42 : 32;

        // ASS time format: H:MM:SS.CC (centiseconds)
        function toASSTime(seconds: number): string {
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = seconds % 60;
            return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
        }

        // Adaptive font size for ASS (slightly larger than drawtext)
        function getASSFontSize(text: string): number {
            const vLen = visibleLength(text);
            const base = width >= 1280 ? 54 : width >= 720 ? 44 : 36;
            if (vLen < 30) return base;
            if (vLen < 60) return Math.round(base * 0.82);
            if (vLen < 100) return Math.round(base * 0.68);
            if (vLen < 150) return Math.round(base * 0.56);
            return Math.round(base * 0.48);
        }

        // ASS header with font attachment and styles
        const assHeader = `[Script Info]
Title: Quran Video
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Verse,${fontName},48,&H00FFFFFF,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,3,2,5,40,40,30,0
Style: VerseNum,${fontName},24,&H0037AFD4,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,2,1,5,40,40,20,0
Style: Tafsir,${fontName},26,&H00E8E8E8,&H000000FF,&H00000000,&H96000000,0,0,0,0,100,100,0,0,1,2,1,5,50,50,20,0

[Fonts]

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

        const assEvents: string[] = [];

        for (let i = 0; i < verses.length; i++) {
            const start = cumulativeTime;
            const end = cumulativeTime + audioInfos[i].duration;
            const startT = toASSTime(start);
            const endT = toASSTime(end);

            const verseRaw = normalizeArabicText(verses[i].text);
            const verseNum = verses[i].verseKey.split(':')[1] || verses[i].verseKey;
            const fontSize = getASSFontSize(verseRaw);

            // Build verse text with line breaks
            const lines = splitIntoLines(verseRaw, maxCharsPerLine);
            const verseText = lines.join('\\N');

            // Fade in/out: {\fad(500,400)}
            const fade = `{\\fad(500,400)}`;

            // Verse text — positioned at center with font size override
            assEvents.push(
                `Dialogue: 0,${startT},${endT},Verse,,0,0,0,,${fade}{\\fs${fontSize}}${verseText}`
            );

            // Verse number ﴿N﴾ — below verse text
            const vnFS = Math.round(fontSize * 0.45);
            assEvents.push(
                `Dialogue: 1,${startT},${endT},VerseNum,,0,0,0,,${fade}{\\fs${vnFS}}﴿${verseNum}﴾`
            );

            // Tafsir text
            if (verses[i].tafsirText) {
                const tafsirRaw = normalizeArabicText(
                    verses[i].tafsirText!.substring(0, 120) + (verses[i].tafsirText!.length > 120 ? '...' : '')
                );
                const tafsirFS = Math.round(fontSize * 0.48);
                const tafsirMaxChars = maxCharsPerLine + 10;
                const tafsirLines = splitIntoLines(tafsirRaw, tafsirMaxChars).slice(0, 2);
                const tafsirText = tafsirLines.join('\\N');
                assEvents.push(
                    `Dialogue: 2,${startT},${endT},Tafsir,,0,0,0,,${fade}{\\fs${tafsirFS}}${tafsirText}`
                );
            }

            cumulativeTime = end;
        }

        // Write ASS subtitle file
        const assContent = assHeader + assEvents.join('\n') + '\n';
        const assFile = path.join(tmpDir, 'subs.ass');
        fs.writeFileSync(assFile, assContent, 'utf8');

        // 6) Final render — use subtitles filter (libass has HarfBuzz for Arabic shaping)
        const outputPath = path.join(tmpDir, 'output.mp4');
        const opacity = Math.max(0, Math.min(1, dimOpacity));

        // Escape the ASS file path for FFmpeg filter
        const assPathEscaped = assFile.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "'\\''");

        // Filter chain: scale + dim + subtitles (with font directory for embedded font)
        const fontsDir = path.join(process.cwd(), 'public', 'fonts').replace(/\\/g, '/').replace(/:/g, '\\:');
        const filterChain =
            `[0:v]trim=duration=${totalDuration},setpts=PTS-STARTPTS,fps=25,` +
            `scale=${width}:${height}:force_original_aspect_ratio=increase,` +
            `crop=${width}:${height},setsar=1,` +
            `drawbox=c=black@${opacity}:t=fill,` +
            `subtitles='${assPathEscaped}':fontsdir='${fontsDir}'` +
            `[vout]`;

        // Write filter to file to avoid Windows ENAMETOOLONG
        const filterFile = path.join(tmpDir, 'filters.txt');
        fs.writeFileSync(filterFile, filterChain);

        await new Promise<void>((resolve, reject) => {
            ffmpeg()
                .input(bgPath)
                .inputOptions(['-stream_loop', '-1'])
                .input(mergedAudio)
                .outputOptions([
                    '-filter_complex_script', filterFile,
                    '-map', '[vout]',
                    '-map', '1:a',
                    '-c:v', 'libx264',
                    '-preset', 'fast',
                    '-crf', '23',
                    '-c:a', 'aac',
                    '-b:a', '256k',
                    '-t', String(Math.min(totalDuration, 600)),
                    '-shortest',
                    '-movflags', '+faststart',
                ])
                .output(outputPath)
                .on('progress', (p) => {
                    if (onProgress && p.percent) onProgress(Math.min(p.percent, 100));
                })
                .on('end', () => resolve())
                .on('error', (e) => reject(e))
                .run();
        });

        return outputPath;
    } catch (error) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { }
        throw error;
    }
}

export function cleanupTempDir(filePath: string) {
    try {
        const dir = path.dirname(filePath);
        if (dir.includes('quran-video-')) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    } catch { }
}

