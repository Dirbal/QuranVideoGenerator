import { NextRequest, NextResponse } from 'next/server';
import { generateVideo, cleanupTempDir, VerseOverlay } from '@/lib/ffmpeg';
import { getVerses, getAudioFiles, getAudioUrl, getTafsir } from '@/lib/quran-api';
import { getRandomVideoUrl, Theme } from '@/lib/pixabay';
import fs from 'fs';

export const maxDuration = 300; // 5 min timeout

export async function POST(req: NextRequest) {
    let outputPath = '';

    try {
        const body = await req.json();
        const {
            chapter,
            from,
            to,
            reciterId,
            theme,
            includeTafsir,
            dimOpacity = 0.5,
            videoWidth = 1280,
            videoHeight = 720,
            fontFile = 'arial.ttf',
        } = body as {
            chapter: number;
            from: number;
            to: number;
            reciterId: number;
            theme: Theme;
            includeTafsir: boolean;
            dimOpacity?: number;
            videoWidth?: number;
            videoHeight?: number;
            fontFile?: string;
        };

        // Validate
        if (!chapter || !from || !to || !reciterId) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        if (to - from > 30) {
            return NextResponse.json(
                { error: 'Maximum 30 verses per video' },
                { status: 400 }
            );
        }

        // 1) Fetch verses
        const verses = await getVerses(chapter, from, to);
        if (!verses.length) {
            return NextResponse.json({ error: 'No verses found' }, { status: 404 });
        }

        // 2) Fetch audio
        const audioFiles = await getAudioFiles(reciterId, chapter);
        const audioMap = new Map(audioFiles.map((a) => [a.verse_key, getAudioUrl(a.url)]));

        // 3) Fetch tafsir if enabled
        const tafsirMap = new Map<string, string>();
        if (includeTafsir) {
            for (const v of verses) {
                const text = await getTafsir(chapter, v.verse_number);
                if (text) {
                    // Strip HTML tags
                    const cleanText = text.replace(/<[^>]*>/g, '').substring(0, 200);
                    tafsirMap.set(v.verse_key, cleanText);
                }
            }
        }

        // 4) Get background video
        const bgUrl = await getRandomVideoUrl(theme || 'nature');

        // 5) Build verse overlays
        const overlays: VerseOverlay[] = verses.map((v) => ({
            text: v.text_uthmani,
            tafsirText: tafsirMap.get(v.verse_key) || undefined,
            audioUrl: audioMap.get(v.verse_key) || '',
            verseKey: v.verse_key,
        }));

        // 6) Generate video
        outputPath = await generateVideo(overlays, bgUrl, dimOpacity, videoWidth, videoHeight, fontFile);

        // 7) Stream the file as response
        const fileBuffer = fs.readFileSync(outputPath);

        // Cleanup after sending
        setTimeout(() => cleanupTempDir(outputPath), 5000);

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': 'video/mp4',
                'Content-Disposition': `attachment; filename="quran_${chapter}_${from}-${to}.mp4"`,
                'Content-Length': String(fileBuffer.length),
            },
        });
    } catch (error: any) {
        console.error('Video generation error:', error?.message, error?.stack);
        if (outputPath) cleanupTempDir(outputPath);
        return NextResponse.json(
            { error: error?.message || 'Video generation failed', details: String(error) },
            { status: 500 }
        );
    }
}
