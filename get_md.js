// ==UserScript==
// @name         YouTube → Obsidian Zettelkasten (MD Button)
// @namespace    https://obsidian.md/youtube-zettelkasten
// @version      1.2.0
// @description  Добавляет кнопку [MD] под видео на YouTube для создания полной заметки Zettelkasten (все 5 частей в одном .md файле без дублирования: 100% выжимка из видео + внешний контекст и аналитика) с таймкодами (по главам автора или каждые 3 мин) через меню ИИ YouTube «Задать вопрос» и резервом на llama.cpp / OpenRouter / Gemini API.
// @author       YouTube Zettelkasten Tool
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      127.0.0.1
// @connect      localhost
// @connect      openrouter.ai
// @connect      generativelanguage.googleapis.com
// @connect      www.youtube.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 1. НАСТРОЙКИ ПО УМОЛЧАНИЮ (сохраняются в хранилище Tampermonkey)
    // =========================================================================
    const DEFAULT_CONFIG = {
        aiMode: 'auto', // 'auto' | 'youtube-ask' | 'llamacpp' | 'openrouter' | 'gemini' | 'none'
        askStrategy: 'multi', // 'multi' (3 шага в чате YouTube) | 'full' (1 запрос)
        blockIntervalSec: 180, // 180 секунд = 3 минуты (если нет глав автора)
        llamacppUrl: 'http://127.0.0.1:8080/v1/chat/completions',
        llamacppModel: 'local-model',
        openrouterUrl: 'https://openrouter.ai/api/v1/chat/completions',
        openrouterKey: '',
        openrouterModel: 'google/gemini-2.5-flash',
        geminiKey: '',
        geminiModel: 'gemini-2.5-flash',
        saveMode: 'download', // 'download' (.md файл) | 'obsidian-uri' (сразу в базу Obsidian) | 'both'
        downloadSubfolder: 'Obsidian_YouTube_Zettelkasten', // Подпапка внутри ~/Downloads (для GM_download)
        obsidianVault: '', // Имя вашего Vault в Obsidian (для режима obsidian://new)
        obsidianFolder: '90_sources/YouTube' // Папка внутри Vault Obsidian
    };

    function getConfig() {
        const cfg = {};
        for (const [k, defVal] of Object.entries(DEFAULT_CONFIG)) {
            cfg[k] = GM_getValue(k, defVal);
        }
        return cfg;
    }

    function saveConfig(newCfg) {
        for (const [k, val] of Object.entries(newCfg)) {
            GM_setValue(k, val);
        }
    }

    // =========================================================================
    // 2. СИСТЕМНЫЙ ПРОМПТ ZETTELKASTEN (БЕЗ ДУБЛИРОВАНИЯ МЕЖДУ ЧАСТЯМИ 1 И 2)
    // =========================================================================
    const TRANSCRIPT_PLACEHOLDER = '{{FULL_TRANSCRIPT_BLOCK}}';

    const ZETTELKASTEN_SYSTEM_PROMPT = `# SYSTEM PROMPT — Максимальная выжимка из видео + внешний контекст → Zettelkasten для Obsidian

## Роль
Ты — эксперт по Zettelkasten, PKM, Obsidian, системному анализу и технической документации.

## Цель
Преобразуй видео в исчерпывающий комплект материалов для базы знаний Obsidian.
КРИТИЧЕСКОЕ ПРАВИЛО: **Часть 1** и **Часть 2** НЕ должны дублировать друг друга!
- **Часть 1 (Literature Note)** — это 100% жёсткая фактологическая и техническая выжимка **ТОЛЬКО ИЗ САМОГО ВИДЕО** (хронология, все детали, команды, код, параметры, цифры, пошаговые алгоритмы, термины и ссылки без воды и общих рассуждений).
- **Часть 2 (Contextual & Analytical Note)** — это **ДОПОЛНИТЕЛЬНЫЙ КОНТЕКСТ ВОКРУГ ВИДЕО И ГЛУБОКАЯ АНАЛИТИКА** (предыстория проблемы, пререквизиты, место в экосистеме, сравнение с альтернативами вне видео, неочевидные инсайты, границы применимости и подводные камни, о которых умолчал автор).

Результат должен состоять из пяти логических частей в одном документе:
1. **Часть 1. Literature Note (Максимальная выжимка фактов из видео)**
2. **Часть 2. Contextual & Analytical Note (Контекст вокруг видео, экосистема и аналитика)**
3. **Часть 3. Permanent Notes (3–10 атомарных заметок Zettelkasten)**
4. **Часть 4. Knowledge Graph (Mermaid)**
5. **Часть 5. Индекс знаний (Dataview)**

---

# Общие правила
- Используй русский язык (если видео на другом языке — переведи на русский).
- Исправляй ошибки ASR/OCR в терминах, названиях технологий и именах.
- Сохраняй оригинальные английские термины в скобках при первом упоминании.
- Используй разметку Markdown и внутренние ссылки Obsidian \`[[...]]\`.
- В Части 1 опирайся строго на содержание видео, а в Части 2 дополняй разбор экспертным контекстом предметной области (чётко разделяя, что было в ролике, а что является дополнительным контекстом).

---

# Часть 1. Literature Note (Максимальная выжимка из видео)

Никаких общих вступлений — выжми из видео 100% фактов и конкретики:

## 1.1. Детальный хронологический конспект по таймкодам
- Разбери видео блок за блоком с таймкодами \`[MM:SS]\`.
- Для каждого смыслового блока укажи: тезис автора, конкретные примеры, приведённые аргументы, цифры/метрики и что именно демонстрируется на экране.

## 1.2. Пошаговые алгоритмы и инструкции из видео (How-To / Workflows)
- Если в видео показана настройка, сборка, разработка или методика — выпиши её в виде чёткого воспроизводимого чек-листа («Шаг 1 → Шаг 2 → Шаг 3»).

## 1.3. Технические артефакты: код, команды, конфиги, параметры и формулы
- Восстанови и оформи в блоках кода все показанные или озвученные команды терминала, фрагменты кода, конфигурационные файлы, флаги запуска, API-эндпоинты, названия моделей, версии пакетов, схемы или математические формулы.

## 1.4. Полный глоссарий терминов и сущностей из видео
- Список всех узкоспециализированных терминов, аббревиатур и технологий из ролика с точным определением того, как они используются в видео.

## 1.5. Упомянутые ресурсы, инструменты и ссылки
- Все программы, библиотеки, GitHub-репозитории, статьи, книги, каналы, люди и сервисы, названные автором или указанные в описании.

## Полная транскрипция
Оставь здесь точный маркер ${TRANSCRIPT_PLACEHOLDER} (скрипт автоматически подставит на его место полную русскоязычную транскрипцию со всеми таймкодами без сокращений).

---

# Часть 2. Contextual & Analytical Note (Контекст вокруг видео и глубокая аналитика)

НЕ пересказывай сюжет видео повторно! Дай расширенный контекст темы и критический разбор:

- 🌍 **Контекст проблемы и предпосылки (Background & Why Now):** какую фундаментальную задачу решает тема видео, почему она актуальна именно сейчас и какие базовые знания (пререквизиты) нужны, чтобы полностью понять материал.
- ⚖️ **Место в экосистеме и сравнение с альтернативами:** какие существуют альтернативные инструменты, подходы или архитектуры для решения той же задачи (даже если автор их не упомянул), в чём их плюсы, минусы и компромиссы (trade-offs) по сравнению с подходом из видео.
- 💡 **3–7 глубинных инсайтов и неочевидных выводов:** какие главные инженерные, концептуальные или практические закономерности стоят за материалом видео.
- 🎯 **Практические сценарии внедрения и границы применимости:** в каких реальных проектах и условиях этот метод даст максимальный эффект, а в каких случаях его применять НЕ следует.
- ⚠️ **Подводные камни, риски и упущения автора:** какие ограничения, узкие места (bottlenecks), проблемы безопасности/масштабируемости или важные нюансы автор упростил, пропустил или оставил за кадром.
- 🔗 **Вектор дальнейшего изучения и связанные темы:** что изучить следующим шагом, смежные концепты \`[[...]]\` и теги \`#...\`.

---

# Часть 3. Permanent Notes (Атомарные заметки Zettelkasten)

Выдели 3–10 независимых атомарных концептов. Каждая заметка должна быть самодостаточной (понятной без просмотра видео) и оформленной строго по структуре:

## 📌 Название концепта

### 📝 Атомарная идея
Одна законченная самостоятельная мысль (2–4 предложения), сформулированная своими словами.

### Контекст и почему это важно
Объяснение механизма работы, причины важности и связи с другими идеями.

### Практическое применение
Конкретный пример использования или правило принятия решений.

### Связанные заметки
[[...]]
[[...]]

### Теги
#...

---

# Часть 4. Knowledge Graph

Создай подробную диаграмму связей концептов видео и внешнего контекста в формате Mermaid:

\`\`\`mermaid
graph TD
    Video["Тема видео"] --> CoreConcept1["Ключевой концепт 1"]
    Video --> CoreConcept2["Ключевой концепт 2"]
    CoreConcept1 --> ToolOrMethod["Инструмент / Метод"]
    CoreConcept2 --> Alternative["Альтернатива в экосистеме"]
\`\`\`

---

# Часть 5. Индекс знаний

\`\`\`text
Concepts::
Related::
Tools::
Algorithms::
Libraries::
People::
Companies::
Standards::
Projects::
Files::
\`\`\``;

    // Встроенный ИИ YouTube («Задать вопрос») блокирует ролевые инструкции («Ты — эксперт...»),
    // спецсимволы разметки ([[...]], [MM:SS], ::, mermaid) и названия внешних программ (Obsidian, Zettelkasten).
    // Поэтому для панели YouTube используем естественные вопросы без стоп-слов, строго разделяя:
    // Шаг 1 = Максимальная выжимка фактов ИЗ видео; Шаг 2 = Дополнительный контекст ВОКРУГ видео и сравнение с альтернативами.
    const YOUTUBE_ASK_STEPS = [
        [
            'Часть 1. Literature Note (Максимальная выжимка из видео)',
            'Сделай максимально полную и детальную выжимку всех фактов и технических подробностей из этого видео на русском языке (английские термины указывай в скобках):\n' +
                '1) Подробный хронологический конспект по таймкодам: что именно рассказывает и показывает автор в каждой части, какие аргументы, цифры и примеры приводит.\n' +
                '2) Пошаговые инструкции и алгоритмы действий (шаг 1, шаг 2 и так далее), если в видео показана настройка, сборка или методика.\n' +
                '3) Все конкретные команды, фрагменты кода, настройки, параметры, флаги, формулы и версии программ, которые звучат или появляются в ролике.\n' +
                '4) Полный список всех упомянутых терминов, технологий, программ, библиотек и полезных ресурсов с кратким пояснением.'
        ],
        [
            'Часть 2. Contextual & Analytical Note (Контекст вокруг видео и аналитика)',
            'Не пересказывая повторно сюжет видео, дай глубокий аналитический разбор и дополнительный контекст по теме этого ролика на русском языке:\n' +
                '- Контекст и предпосылки: какую глобальную проблему решает тема видео, почему она актуальна и какие базовые знания нужны для её понимания.\n' +
                '- Сравнение с альтернативами: какие ещё существуют подходы, технологии или инструменты для решения этой же задачи, в чём их плюсы и минусы по сравнению с методом автора.\n' +
                '- От 3 до 7 главных неочевидных выводов и идей, которые можно извлечь из материала.\n' +
                '- Практическое применение и границы применимости: в каких реальных задачах этот подход работает лучше всего, а где его использовать не стоит.\n' +
                '- Подводные камни, ограничения и важные нюансы, о которых автор не сказал или упомянул лишь вскользь.\n' +
                '- Смежные темы для дальнейшего изучения и ключевые слова.'
        ],
        [
            'Часть 3. Permanent Notes и Индекс понятий',
            'Выдели из материала видео и его контекста от 3 до 7 главных самостоятельных понятий или принципов на русском языке. ' +
                'Для каждого понятия напиши отдельно:\n' +
                '- Название понятия\n' +
                '- Суть идеи (в двух-трёх предложениях, чтобы она была понятна сама по себе без видео)\n' +
                '- Почему это важно и как применять на практике\n\n' +
                'В самом конце перечисли списком по категориям все упомянутые в видео инструменты, библиотеки, алгоритмы, стандарты, людей, компании и проекты.'
        ]
    ];

    const YOUTUBE_ASK_SINGLE_PROMPT =
        'Сделай максимально подробный разбор этого видео на русском языке (английские термины указывай в скобках) из двух частей без повторов:\n' +
        'Часть 1 (Выжимка из видео): подробный конспект по таймкодам со всеми деталями, пошаговыми действиями, командами, кодом, настройками, цифрами, терминами и упомянутыми ресурсами.\n' +
        'Часть 2 (Контекст вокруг видео и аналитика): какая проблема решается, сравнение подхода автора с другими альтернативными решениями, 3–7 главных выводов, где применять на практике, подводные камни и ограничения.';

    const YOUTUBE_ASK_FALLBACK_PROMPT =
        'Подробно разбери это видео на русском языке: напиши детальный конспект по таймкодам со всеми техническими подробностями, командами и примерами, а затем отдельно опиши контекст темы, сравнение с альтернативами, практические выводы и подводные камни.';

    function isYouTubeAskRefusal(text) {
        if (!text) return true;
        const lower = String(text).toLowerCase().trim();
        if (lower.length < 35) return true;
        const refusalPatterns = [
            'невозможно обработать этот запрос',
            'попробуйте что-нибудь другое',
            'не могу обработать',
            'я не могу помочь с этим',
            'unable to process this request',
            'try asking something else',
            'try something else',
            'i can’t help with that',
            'i cannot help with that'
        ];
        return refusalPatterns.some((p) => lower.includes(p));
    }

    // =========================================================================
    // 3. ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ТАЙМКОДОВ И ФОРМАТИРОВАНИЯ
    // =========================================================================
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    function formatSeconds(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (n) => String(n).padStart(2, '0');
        return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    }

    function tsToSeconds(tsStr) {
        const parts = String(tsStr || '')
            .trim()
            .split(':')
            .map((p) => parseInt(p, 10))
            .filter((n) => !Number.isNaN(n));
        if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
        if (parts.length === 2) return parts[0] * 60 + parts[1];
        return 0;
    }

    function sanitizeFilename(name) {
        return (
            String(name || 'youtube_note')
                .replace(/[\\/*?:"<>|]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 120) || 'youtube_note'
        );
    }

    function parseChaptersFromDescription(description) {
        const chapters = [];
        const lines = String(description || '').split(/\r?\n/);
        const regex = /^(?:[-*•]\s*)?(?:\[)?(\d{1,2}:\d{2}(?::\d{2})?)(?:\])?\s*[-—–:]?\s*(.+)$/;
        for (const rawLine of lines) {
            const m = rawLine.trim().match(regex);
            if (m) {
                const normTs = formatSeconds(tsToSeconds(m[1]));
                const title = m[2].trim();
                if (title) chapters.push([normTs, title]);
            }
        }
        return chapters;
    }

    // =========================================================================
    // 4. ИЗВЛЕЧЕНИЕ МЕТАДАННЫХ, ГЛАВ АВТОРА И СУБТИТРОВ СО СТРАНИЦЫ YOUTUBE
    // =========================================================================
    function getPagePlayerResponse() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const moviePlayer = document.getElementById('movie_player');
        if (moviePlayer && typeof moviePlayer.getPlayerResponse === 'function') {
            try {
                const pr = moviePlayer.getPlayerResponse();
                if (pr && pr.videoDetails) return pr;
            } catch (_) {}
        }
        const flexy = document.querySelector('ytd-watch-flexy');
        if (flexy && flexy.playerData && flexy.playerData.videoDetails) {
            return flexy.playerData;
        }
        return win.ytInitialPlayerResponse || {};
    }

    function extractVideoMetadata() {
        const pr = getPagePlayerResponse();
        const vd = pr.videoDetails || {};
        const micro = (pr.microformat && pr.microformat.playerMicroformatRenderer) || {};
        const urlParams = new URLSearchParams(window.location.search);
        const videoId = vd.videoId || urlParams.get('v') || 'unknown';
        const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

        const title =
            vd.title ||
            (document.querySelector('ytd-watch-metadata h1')?.textContent || document.title.replace(' - YouTube', '')).trim();
        const channel =
            vd.author ||
            (document.querySelector('ytd-watch-metadata ytd-channel-name a')?.textContent || 'YouTube').trim();
        const durationSec = parseInt(vd.lengthSeconds || '0', 10) || 0;
        const description = vd.shortDescription || micro.description?.simpleText || '';
        const published = (micro.publishDate || micro.uploadDate || '').slice(0, 10);
        const tags = Array.isArray(vd.keywords) ? vd.keywords : [];

        const chapters = parseChaptersFromDescription(description);
        const tracks =
            (pr.captions &&
                pr.captions.playerCaptionsTracklistRenderer &&
                pr.captions.playerCaptionsTracklistRenderer.captionTracks) ||
            [];

        return {
            videoId,
            url: cleanUrl,
            title,
            author: channel,
            channel,
            description,
            published,
            durationSec,
            durationStr: durationSec ? formatSeconds(durationSec) : '',
            chapters,
            tags,
            captionTracks: tracks
        };
    }

    async function fetchTranscriptSegmentsFromPlayer(captionTracks) {
        if (!captionTracks || captionTracks.length === 0) return [];

        let chosenUrl = null;
        for (const t of captionTracks) {
            if (t.languageCode === 'ru') {
                chosenUrl = t.baseUrl;
                break;
            }
        }
        if (!chosenUrl) {
            const first = captionTracks[0];
            chosenUrl = first.isTranslatable ? `${first.baseUrl}&tlang=ru` : first.baseUrl;
        }
        if (!chosenUrl) return [];

        try {
            // Запрашиваем JSON3 или XML субтитров прямо из сессии браузера
            const jsonUrl = chosenUrl.includes('fmt=') ? chosenUrl : `${chosenUrl}&fmt=json3`;
            const resp = await fetch(jsonUrl, { credentials: 'same-origin' });
            const text = await resp.text();

            if (text.trim().startsWith('{')) {
                const data = JSON.parse(text);
                const events = data.events || [];
                const segs = [];
                for (const ev of events) {
                    if (!ev.segs) continue;
                    const startSec = (ev.tStartMs || 0) / 1000.0;
                    const chunk = ev.segs
                        .map((s) => s.utf8 || '')
                        .join('')
                        .replace(/\n+/g, ' ')
                        .trim();
                    if (chunk) segs.push({ start: startSec, text: chunk });
                }
                if (segs.length > 0) return segs;
            }

            // Резервный разбор XML
            const xmlResp = await fetch(chosenUrl, { credentials: 'same-origin' });
            const xmlText = await xmlResp.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
            const nodes = Array.from(xmlDoc.querySelectorAll('text'));
            return nodes
                .map((n) => ({
                    start: parseFloat(n.getAttribute('start') || '0') || 0,
                    text: (n.textContent || '').replace(/\s+/g, ' ').trim()
                }))
                .filter((s) => s.text.length > 0);
        } catch (err) {
            console.warn('[YT-Zettel] Ошибка получения субтитров из captionTracks:', err);
            return [];
        }
    }

    function groupSegmentsByChaptersOrInterval(segments, chapters, blockIntervalSec = 180) {
        if (!segments || segments.length === 0) {
            return {
                transcriptMd: '_Субтитры для данного видео отключены автором или недоступны._',
                groupedBlocks: []
            };
        }

        // 1. Если у видео есть главы автора (Chapters) — группируем строго по ним
        if (chapters && chapters.length > 0) {
            const sortedCh = chapters
                .map(([ts, title]) => [tsToSeconds(ts), ts, title])
                .sort((a, b) => a[0] - b[0]);

            if (sortedCh[0][0] > 5) {
                sortedCh.unshift([0, '00:00', 'Вступление']);
            }

            const buckets = sortedCh.map(() => []);
            for (const seg of segments) {
                const start = Number(seg.start) || 0;
                const txt = String(seg.text || '').trim();
                if (!txt) continue;
                let chIdx = 0;
                for (let i = 0; i < sortedCh.length; i++) {
                    if (start >= sortedCh[i][0]) chIdx = i;
                    else break;
                }
                buckets[chIdx].push(txt);
            }

            const groupedBlocks = [];
            const mdParts = [];
            for (let i = 0; i < sortedCh.length; i++) {
                const [, tsLabel, chTitle] = sortedCh[i];
                const joined = buckets[i].join(' ').trim();
                if (!joined) continue;
                groupedBlocks.push([tsLabel, chTitle, joined]);
                const header = chTitle ? `## [${tsLabel}] ${chTitle}` : `## [${tsLabel}]`;
                mdParts.push(`${header}\n${joined}\n`);
            }

            if (mdParts.length > 0) {
                return { transcriptMd: mdParts.join('\n').trim(), groupedBlocks };
            }
        }

        // 2. Если глав нет — разбиваем каждые 3 минуты (blockIntervalSec = 180)
        const groupedBlocks = [];
        let currentStart = null;
        let currentTexts = [];

        for (const seg of segments) {
            const start = Number(seg.start) || 0;
            const txt = String(seg.text || '').trim();
            if (!txt) continue;

            if (currentStart === null) {
                currentStart = start;
                currentTexts.push(txt);
            } else if (start - currentStart >= blockIntervalSec) {
                const tsLabel = formatSeconds(currentStart);
                groupedBlocks.push([tsLabel, '', currentTexts.join(' ')]);
                currentStart = start;
                currentTexts = [txt];
            } else {
                currentTexts.push(txt);
            }
        }

        if (currentStart !== null && currentTexts.length > 0) {
            const tsLabel = formatSeconds(currentStart);
            groupedBlocks.push([tsLabel, '', currentTexts.join(' ')]);
        }

        const mdParts = groupedBlocks.map(([tsLabel, , blockText]) => `## [${tsLabel}]\n${blockText}\n`);
        return { transcriptMd: mdParts.join('\n').trim(), groupedBlocks };
    }

    // =========================================================================
    // 5. РАБОТА С МЕНЮ ИИ YOUTUBE «ЗАДАТЬ ВОПРОС» ПРЯМО НА СТРАНИЦЕ
    // =========================================================================
    function findAskButtonOnPage() {
        const candidates = Array.from(
            document.querySelectorAll(
                'ytd-watch-metadata button, ytd-menu-renderer button, yt-button-view-model button'
            )
        );
        for (const btn of candidates) {
            const label = ((btn.textContent || '') + ' ' + (btn.getAttribute('aria-label') || '')).toLowerCase();
            if (
                label.includes('задать вопрос') ||
                label.includes('спросить') ||
                label.includes('ask about') ||
                label.trim() === 'ask'
            ) {
                return btn;
            }
        }
        return null;
    }

    async function runYouTubeAskPanelOnPage(askStrategy, setStatus) {
        let askBtn = findAskButtonOnPage();

        if (!askBtn) {
            // Пробуем открыть меню «Ещё» (...) под видео
            const moreBtn = document.querySelector(
                'ytd-watch-metadata ytd-menu-renderer button[aria-label*="Ещё"], ' +
                    'ytd-watch-metadata ytd-menu-renderer button[aria-label*="Еще"], ' +
                    'ytd-watch-metadata ytd-menu-renderer button[aria-label*="More"]'
            );
            if (moreBtn) {
                moreBtn.click();
                await sleep(800);
                const menuItems = Array.from(document.querySelectorAll('ytd-menu-service-item-renderer'));
                const askItem = menuItems.find((el) => {
                    const t = (el.textContent || '').toLowerCase();
                    return t.includes('задать вопрос') || t.includes('спросить') || t.includes('ask');
                });
                if (askItem) {
                    askItem.click();
                    await sleep(2200);
                } else {
                    document.body.click(); // закрываем меню
                    return null;
                }
            } else {
                return null;
            }
        } else {
            askBtn.click();
            await sleep(2200);
        }

        const steps =
            askStrategy === 'full'
                ? [['Часть 1. Literature Note и разбор видео', YOUTUBE_ASK_SINGLE_PROMPT]]
                : YOUTUBE_ASK_STEPS;

        const collected = [];
        for (let i = 0; i < steps.length; i++) {
            const [stepTitle, stepPrompt] = steps[i];
            setStatus(`YouTube AI (${i + 1}/${steps.length})...`);
            let ans = await sendPromptToYouTubePanel(stepPrompt, 110000);
            if (isYouTubeAskRefusal(ans)) {
                console.warn('[YT-Zettel] YouTube AI вернул заглушку отказа, пробуем упрощённый запрос...');
                if (i === 0) {
                    await sleep(1200);
                    ans = await sendPromptToYouTubePanel(YOUTUBE_ASK_FALLBACK_PROMPT, 110000);
                }
            }
            if (ans && !isYouTubeAskRefusal(ans)) {
                collected.push(`# ${stepTitle}\n\n${ans}`);
            }
            await sleep(1500);
        }

        return collected.length > 0 ? collected.join('\n\n') : null;
    }

    async function sendPromptToYouTubePanel(promptText, timeoutMs = 110000) {
        const selectors = [
            'ytd-engagement-panel-section-list-renderer textarea',
            'ytd-engagement-panel-section-list-renderer [contenteditable="true"]',
            'yt-chat-input-renderer textarea',
            'yt-chat-input-renderer [contenteditable="true"]',
            '[placeholder*="Задайте вопрос"]',
            '[placeholder*="Спросите"]',
            '[placeholder*="Ask"]'
        ];

        let inputEl = null;
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) {
                inputEl = el;
                break;
            }
        }
        if (!inputEl) return null;

        const panelContent = document.querySelector(
            'ytd-engagement-panel-section-list-renderer[visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"] #content'
        );
        const beforeText = panelContent ? panelContent.innerText.trim() : '';

        inputEl.focus();
        if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
            inputEl.value = promptText;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            inputEl.textContent = promptText;
            inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: promptText }));
        }
        await sleep(400);

        inputEl.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true })
        );

        const sendBtn = document.querySelector(
            'ytd-engagement-panel-section-list-renderer button[aria-label*="Отправить"], ' +
                'ytd-engagement-panel-section-list-renderer button[aria-label*="Send"]'
        );
        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
        }

        let lastText = beforeText;
        let stableTicks = 0;
        const start = Date.now();

        while (Date.now() - start < timeoutMs) {
            await sleep(2500);
            if (!panelContent) continue;
            const currentText = panelContent.innerText.trim();
            if (currentText.length > beforeText.length + 25) {
                if (currentText === lastText) {
                    stableTicks += 1;
                    if (stableTicks >= 3) break;
                } else {
                    stableTicks = 0;
                    lastText = currentText;
                }
            }
        }

        if (lastText.length > beforeText.length) {
            return lastText.slice(beforeText.length).replace(promptText, '').trim();
        }
        return null;
    }

    // =========================================================================
    // 6. РЕЗЕРВНЫЕ ИИ ЧЕРЕЗ GM_xmlhttpRequest (LLAMA.CPP -> OPENROUTER -> GEMINI)
    // =========================================================================
    function gmPostJson(url, headers, payload, timeoutMs = 300000) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url,
                headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
                data: JSON.stringify(payload),
                timeout: timeoutMs,
                onload: (resp) => {
                    if (resp.status >= 200 && resp.status < 300) {
                        try {
                            resolve(JSON.parse(resp.responseText));
                        } catch (e) {
                            reject(new Error(`Ошибка разбора JSON от ${url}: ${e.message}`));
                        }
                    } else {
                        reject(new Error(`HTTP ${resp.status}: ${(resp.responseText || '').slice(0, 250)}`));
                    }
                },
                onerror: () => reject(new Error(`Сетевая ошибка при обращении к ${url}`)),
                ontimeout: () => reject(new Error(`Превышено время ожидания ответа от ${url}`))
            });
        });
    }

    function buildUserMessage(meta, transcriptMd) {
        const chaptersStr =
            meta.chapters && meta.chapters.length > 0
                ? meta.chapters.map(([ts, t]) => `- [${ts}] ${t}`).join('\n')
                : 'Не размечены автором (транскрипция разбита каждые 3 минуты)';

        return (
            `Преобразуй это видео в полный комплект материалов Zettelkasten для Obsidian (все 5 частей в одном ответе без дублирования между Частью 1 и Частью 2).\n` +
            `ВАЖНО:\n` +
            `1. В Части 1 (Literature Note) максимально выжми ВСЮ фактологию, хронологию по таймкодам, пошаговые инструкции, команды, код, конфиги, цифры, термины и ссылки непосредственно ИЗ видео. В подразделе \`## Полная транскрипция\` оставь точный маркер \`${TRANSCRIPT_PLACEHOLDER}\` (скрипт автоматически подставит туда полную транскрипцию).\n` +
            `2. В Части 2 (Contextual & Analytical Note) НЕ повторяй пересказ видео — дай дополнительный внешний контекст вокруг темы видео: предысторию проблемы, пререквизиты, место в экосистеме, сравнение с альтернативными решениями/инструментами вне видео, 3–7 глубинных инсайтов, границы применимости и подводные камни, о которых не сказал автор.\n\n` +
            `## Метаданные видео\n` +
            `- **Название:** ${meta.title}\n` +
            `- **Автор / Канал:** ${meta.channel}\n` +
            `- **URL:** ${meta.url}\n` +
            `- **Video ID:** ${meta.videoId}\n` +
            `- **Дата публикации:** ${meta.published}\n` +
            `- **Длительность:** ${meta.durationStr}\n` +
            `- **Теги:** ${(meta.tags || []).slice(0, 20).join(', ')}\n\n` +
            `## Главы автора (Chapters)\n${chaptersStr}\n\n` +
            `## Описание видео\n${(meta.description || '').slice(0, 4000)}\n\n` +
            `## Полная транскрипция по таймкодам\n${transcriptMd.slice(0, 75000)}\n`
        );
    }

    async function runFallbackLlmChain(meta, transcriptMd, cfg, setStatus) {
        const userMessage = buildUserMessage(meta, transcriptMd);

        // 1. Локальный сервер llama.cpp
        if ((cfg.aiMode === 'auto' || cfg.aiMode === 'llamacpp') && cfg.llamacppUrl) {
            try {
                setStatus('Запрос к llama.cpp...');
                const data = await gmPostJson(
                    cfg.llamacppUrl,
                    { Authorization: 'Bearer sk-llamacpp-local' },
                    {
                        model: cfg.llamacppModel || 'local-model',
                        messages: [
                            { role: 'system', content: ZETTELKASTEN_SYSTEM_PROMPT },
                            { role: 'user', content: userMessage }
                        ],
                        temperature: 0.2
                    }
                );
                const content = data?.choices?.[0]?.message?.content?.trim();
                if (content) return content;
            } catch (e) {
                console.info('[YT-Zettel] llama.cpp недоступен, пробуем следующий провайдер:', e.message);
            }
        }

        // 2. OpenRouter API
        if ((cfg.aiMode === 'auto' || cfg.aiMode === 'openrouter') && cfg.openrouterKey) {
            try {
                setStatus('Запрос к OpenRouter...');
                const data = await gmPostJson(
                    cfg.openrouterUrl || 'https://openrouter.ai/api/v1/chat/completions',
                    {
                        Authorization: `Bearer ${cfg.openrouterKey}`,
                        'HTTP-Referer': 'https://obsidian.md',
                        'X-Title': 'Obsidian YouTube Zettelkasten'
                    },
                    {
                        model: cfg.openrouterModel || 'google/gemini-2.5-flash',
                        messages: [
                            { role: 'system', content: ZETTELKASTEN_SYSTEM_PROMPT },
                            { role: 'user', content: userMessage }
                        ],
                        temperature: 0.2
                    }
                );
                const content = data?.choices?.[0]?.message?.content?.trim();
                if (content) return content;
            } catch (e) {
                console.warn('[YT-Zettel] Ошибка OpenRouter API:', e.message);
            }
        }

        // 3. Google Gemini API
        if ((cfg.aiMode === 'auto' || cfg.aiMode === 'gemini') && cfg.geminiKey) {
            try {
                setStatus('Запрос к Gemini API...');
                const cleanModel = (cfg.geminiModel || 'gemini-2.5-flash').replace(/^google\//, '');
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${cfg.geminiKey}`;
                const data = await gmPostJson(url, {}, {
                    systemInstruction: { parts: [{ text: ZETTELKASTEN_SYSTEM_PROMPT }] },
                    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                    generationConfig: { temperature: 0.2 }
                });
                const parts = data?.candidates?.[0]?.content?.parts || [];
                const text = parts.map((p) => p.text || '').join('').trim();
                if (text) return text;
            } catch (e) {
                console.warn('[YT-Zettel] Ошибка Gemini API:', e.message);
            }
        }

        return null;
    }

    // =========================================================================
    // 7. СБОРКА ЕДИНОГО MARKDOWN-ДОКУМЕНТА И СОХРАНЕНИЕ В LINUX / OBSIDIAN
    // =========================================================================
    function buildSingleFileObsidianMarkdown(meta, transcriptMd, groupedBlocks, aiResponse) {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const nowIso = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const todayId = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}-${meta.videoId}`;

        const navLines = [];
        if (meta.chapters && meta.chapters.length > 0) {
            for (const [ts, chTitle] of meta.chapters) {
                navLines.push(`- **[${ts}](${meta.url}&t=${tsToSeconds(ts)}s)** — ${chTitle}`);
            }
        } else if (groupedBlocks && groupedBlocks.length > 0) {
            for (const [ts, chTitle, text] of groupedBlocks) {
                const label = chTitle || (text.slice(0, 95).trim() + (text.length > 95 ? '...' : ''));
                navLines.push(`- **[${ts}](${meta.url}&t=${tsToSeconds(ts)}s)** — ${label}`);
            }
        } else {
            navLines.push('- _Таймкоды не размечены_');
        }

        const navigationMd = navLines.join('\n');
        const safeTitle = (meta.title || '').replace(/"/g, '\\"');
        const safeChannel = (meta.channel || '').replace(/"/g, '\\"');
        const firstLineDesc = ((meta.description || '').split(/\r?\n/)[0] || meta.title || '').replace(/"/g, '\\"').slice(0, 220);

        const cleanTags = (meta.tags || [])
            .slice(0, 12)
            .map((t) => String(t).replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_'))
            .filter(Boolean);
        const tagsYaml =
            cleanTags.length > 0
                ? cleanTags.map((t) => `  - ${t}`).join('\n')
                : '  - youtube\n  - literature-note\n  - zettelkasten';

        const yamlHeader = `---
id: "${todayId}"
title: "${safeTitle}"
aliases:
  - "${safeTitle}"
description: "${firstLineDesc}"
author: "${safeChannel}"
channel: "${safeChannel}"
source: "${meta.url}"
video_id: "${meta.videoId}"
published: "${meta.published}"
duration: "${meta.durationStr}"
created: "${nowIso}"
updated: "${nowIso}"
lang: ru
type: literature-note
status: permanent
tags:
${tagsYaml}
topics: []
keywords: []
zettel:
  parents: []
  children: []
  related: []
---`;

        if (aiResponse) {
            let cleanedAi = aiResponse.replace(/^```yaml\s*---[\s\S]*?---\s*```/i, '').trim();
            if (cleanedAi.startsWith('---')) {
                const endIdx = cleanedAi.indexOf('---', 3);
                if (endIdx !== -1) cleanedAi = cleanedAi.slice(endIdx + 3).trim();
            }

            if (cleanedAi.includes(TRANSCRIPT_PLACEHOLDER)) {
                cleanedAi = cleanedAi.replace(TRANSCRIPT_PLACEHOLDER, transcriptMd);
                return `${yamlHeader}

# ${meta.title}

- **Источник:** [${meta.url}](${meta.url})
- **Канал / Автор:** [[${meta.channel || 'YouTube'}]]
- **Video ID:** \`${meta.videoId}\`
- **Опубликовано:** \`${meta.published || 'Неизвестно'}\`
- **Длительность:** \`${meta.durationStr || 'Неизвестно'}\`

${cleanedAi}
`;
            }

            const transcriptSection = `\n\n## Навигация по видео (Тайминг)\n\n${navigationMd}\n\n## Полная транскрипция\n\n${transcriptMd}\n\n`;
            const part2Match = cleanedAi.match(/^#+\s*Часть\s*2\b/m);
            const combinedAi =
                part2Match && part2Match.index !== undefined
                    ? cleanedAi.slice(0, part2Match.index).trimEnd() +
                      transcriptSection +
                      cleanedAi.slice(part2Match.index)
                    : cleanedAi + transcriptSection;

            return `${yamlHeader}

# ${meta.title}

- **Источник:** [${meta.url}](${meta.url})
- **Канал / Автор:** [[${meta.channel || 'YouTube'}]]
- **Video ID:** \`${meta.videoId}\`
- **Опубликовано:** \`${meta.published || 'Неизвестно'}\`
- **Длительность:** \`${meta.durationStr || 'Неизвестно'}\`

${combinedAi}
`;
        }

        // Резервный шаблон со всеми 5 частями (если ИИ не настроен или выбран режим 'none')
        return `${yamlHeader}

# Часть 1. Literature Note (Максимальная выжимка из видео)

- **Автор / Канал:** [[${meta.channel || 'YouTube'}]]
- **Источник:** [${meta.url}](${meta.url})
- **Длительность:** \`${meta.durationStr || 'Не указана'}\`
- **Опубликовано:** \`${meta.published || 'Не указано'}\`

## Навигация по видео

${navigationMd}

## Полная транскрипция

${transcriptMd}

## Описание, ссылки и ресурсы из-под видео

${meta.description || '_Описание отсутствует_'}

# Часть 2. Contextual & Analytical Note (Контекст вокруг видео и аналитика)

- 🌍 **Контекст проблемы и предпосылки (Background & Why Now):**
- ⚖️ **Место в экосистеме и сравнение с альтернативами:**
- 💡 **3–7 глубинных инсайтов и неочевидных выводов:**
- 🎯 **Практические сценарии внедрения и границы применимости:**
- ⚠️ **Подводные камни, риски и упущения автора:**
- 🔗 **Связанные темы:** [[${meta.channel || 'YouTube'}]]
- 🏷 **Теги:** #youtube #literature-note #zettelkasten

# Часть 3. Permanent Notes

## 📌 Концепт 1

### 📝 Атомарная идея
Одна самостоятельная мысль.

### Контекст и почему это важно

### Практическое применение

### Связанные заметки
[[${meta.title}]]

### Теги
#zettelkasten

# Часть 4. Knowledge Graph

\`\`\`mermaid
graph TD
    Video["${safeTitle.slice(0, 40)}"] --> Literature["Literature Note"]
    Literature --> Context["Contextual & Analytical Note"]
    Context --> Concept1["Concept 1"]
    Context --> Concept2["Concept 2"]
\`\`\`

# Часть 5. Индекс знаний

\`\`\`text
Concepts::
Related:: [[${meta.channel || 'YouTube'}]]
Tools::
Algorithms::
Libraries::
People:: [[${meta.author || 'Автор'}]]
Companies::
Standards::
Projects::
Files::
\`\`\`
`;
    }

    function saveMarkdownFile(markdownText, baseFilename, cfg) {
        const fileName = `${sanitizeFilename(baseFilename)}.md`;

        // 1. Скачивание .md файла на диск (в папку загрузок Linux или подпапку)
        if (cfg.saveMode === 'download' || cfg.saveMode === 'both') {
            const sub = (cfg.downloadSubfolder || '').replace(/^\/+|\/+$/g, '');
            const relativePath = sub ? `${sub}/${fileName}` : fileName;

            const blob = new Blob([markdownText], { type: 'text/markdown;charset=utf-8' });
            const blobUrl = URL.createObjectURL(blob);

            if (typeof GM_download === 'function') {
                GM_download({
                    url: blobUrl,
                    name: relativePath,
                    saveAs: false,
                    onerror: () => triggerAnchorDownload(blobUrl, fileName),
                    onload: () => setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
                });
            } else {
                triggerAnchorDownload(blobUrl, fileName);
            }
        }

        // 2. Прямая отправка заметки в открытый Obsidian по протоколу obsidian://new
        if (cfg.saveMode === 'obsidian-uri' || cfg.saveMode === 'both') {
            const folder = (cfg.obsidianFolder || '').replace(/^\/+|\/+$/g, '');
            const fileParam = folder ? `${folder}/${sanitizeFilename(baseFilename)}` : sanitizeFilename(baseFilename);
            const vaultParam = cfg.obsidianVault ? `vault=${encodeURIComponent(cfg.obsidianVault)}&` : '';
            const obsidianUri = `obsidian://new?${vaultParam}file=${encodeURIComponent(fileParam)}&content=${encodeURIComponent(markdownText)}`;
            window.open(obsidianUri, '_blank');
        }
    }

    function triggerAnchorDownload(blobUrl, fileName) {
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }

    // =========================================================================
    // 8. ОКНО НАСТРОЕК (открывается по ПКМ / Shift+клик на кнопку MD или из меню)
    // =========================================================================
    function openSettingsModal() {
        const existing = document.getElementById('yt-zettel-settings-modal');
        if (existing) {
            existing.remove();
            return;
        }

        const cfg = getConfig();
        const overlay = document.createElement('div');
        overlay.id = 'yt-zettel-settings-modal';
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:Roboto,Arial,sans-serif;';

        const card = document.createElement('div');
        card.style.cssText =
            'background:#1e1e1e;color:#f1f1f1;border:1px solid #383838;border-radius:14px;padding:20px 24px;width:520px;max-width:94vw;max-height:88vh;overflow-y:auto;box-shadow:0 12px 36px rgba(0,0,0,0.6);font-size:13px;line-height:1.45;';

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;border-bottom:1px solid #333;padding-bottom:10px;">
                <strong style="font-size:16px;">⚙️ Настройки YouTube → Obsidian [MD]</strong>
                <button id="yt-zettel-close-btn" style="background:transparent;border:none;color:#aaa;font-size:18px;cursor:pointer;">✕</button>
            </div>

            <label style="display:block;margin-bottom:10px;">
                <div style="margin-bottom:4px;color:#ccc;">Режим ИИ для выполнения промпта Zettelkasten:</div>
                <select id="ytz-aiMode" style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;">
                    <option value="auto" ${cfg.aiMode === 'auto' ? 'selected' : ''}>Авто (YouTube «Задать вопрос» → llama.cpp → OpenRouter → Gemini)</option>
                    <option value="llamacpp" ${cfg.aiMode === 'llamacpp' ? 'selected' : ''}>Сразу локальный llama.cpp сервер</option>
                    <option value="openrouter" ${cfg.aiMode === 'openrouter' ? 'selected' : ''}>Сразу OpenRouter API</option>
                    <option value="gemini" ${cfg.aiMode === 'gemini' ? 'selected' : ''}>Сразу Google Gemini API</option>
                    <option value="youtube-ask" ${cfg.aiMode === 'youtube-ask' ? 'selected' : ''}>Только меню YouTube «Задать вопрос»</option>
                    <option value="none" ${cfg.aiMode === 'none' ? 'selected' : ''}>Без ИИ (только полная транскрипция, главы и шаблон 5 частей)</option>
                </select>
            </label>

            <label style="display:block;margin-bottom:10px;">
                <div style="margin-bottom:4px;color:#ccc;">Локальный сервер llama.cpp (URL):</div>
                <input id="ytz-llamacppUrl" type="text" value="${cfg.llamacppUrl}" style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;box-sizing:border-box;" />
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <label>
                    <div style="margin-bottom:4px;color:#ccc;">OpenRouter API Key:</div>
                    <input id="ytz-openrouterKey" type="password" value="${cfg.openrouterKey}" placeholder="sk-or-v1-..." style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;box-sizing:border-box;" />
                </label>
                <label>
                    <div style="margin-bottom:4px;color:#ccc;">OpenRouter Модель:</div>
                    <input id="ytz-openrouterModel" type="text" value="${cfg.openrouterModel}" style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;box-sizing:border-box;" />
                </label>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
                <label>
                    <div style="margin-bottom:4px;color:#ccc;">Google Gemini API Key:</div>
                    <input id="ytz-geminiKey" type="password" value="${cfg.geminiKey}" placeholder="AIzaSy..." style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;box-sizing:border-box;" />
                </label>
                <label>
                    <div style="margin-bottom:4px;color:#ccc;">Gemini Модель:</div>
                    <input id="ytz-geminiModel" type="text" value="${cfg.geminiModel}" style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;box-sizing:border-box;" />
                </label>
            </div>

            <label style="display:block;margin-bottom:10px;">
                <div style="margin-bottom:4px;color:#ccc;">Способ сохранения готового .md файла в Linux:</div>
                <select id="ytz-saveMode" style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;">
                    <option value="download" ${cfg.saveMode === 'download' ? 'selected' : ''}>Скачать .md файл в папку Загрузки (Downloads)</option>
                    <option value="obsidian-uri" ${cfg.saveMode === 'obsidian-uri' ? 'selected' : ''}>Сразу создать заметку в Obsidian (через obsidian://new)</option>
                    <option value="both" ${cfg.saveMode === 'both' ? 'selected' : ''}>И скачать .md файл, и открыть в Obsidian</option>
                </select>
            </label>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">
                <label>
                    <div style="margin-bottom:4px;color:#ccc;">Подпапка в ~/Downloads:</div>
                    <input id="ytz-downloadSubfolder" type="text" value="${cfg.downloadSubfolder}" placeholder="Obsidian_YouTube_Zettelkasten" style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;box-sizing:border-box;" />
                </label>
                <label>
                    <div style="margin-bottom:4px;color:#ccc;">Имя базы (Vault) в Obsidian:</div>
                    <input id="ytz-obsidianVault" type="text" value="${cfg.obsidianVault}" placeholder="Необязательно" style="width:100%;padding:7px;border-radius:6px;background:#2a2a2a;color:#fff;border:1px solid #444;box-sizing:border-box;" />
                </label>
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button id="yt-zettel-save-btn" style="background:#7c3aed;color:#fff;border:none;padding:8px 18px;border-radius:18px;font-weight:600;cursor:pointer;">Сохранить</button>
            </div>
        `;

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        document.getElementById('yt-zettel-close-btn').onclick = () => overlay.remove();
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };

        document.getElementById('yt-zettel-save-btn').onclick = () => {
            saveConfig({
                aiMode: document.getElementById('ytz-aiMode').value,
                llamacppUrl: document.getElementById('ytz-llamacppUrl').value.trim(),
                openrouterKey: document.getElementById('ytz-openrouterKey').value.trim(),
                openrouterModel: document.getElementById('ytz-openrouterModel').value.trim(),
                geminiKey: document.getElementById('ytz-geminiKey').value.trim(),
                geminiModel: document.getElementById('ytz-geminiModel').value.trim(),
                saveMode: document.getElementById('ytz-saveMode').value,
                downloadSubfolder: document.getElementById('ytz-downloadSubfolder').value.trim(),
                obsidianVault: document.getElementById('ytz-obsidianVault').value.trim()
            });
            overlay.remove();
        };
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('⚙️ Настройки YouTube → Obsidian [MD]', openSettingsModal);
    }

    // =========================================================================
    // 9. КНОПКА [MD] ПОД ВИДЕО И ОБРАБОТЧИК НАЖАТИЯ
    // =========================================================================
    let isProcessing = false;

    async function handleMdButtonClick(event, btnEl, labelEl) {
        if (event.shiftKey || event.ctrlKey) {
            event.preventDefault();
            openSettingsModal();
            return;
        }
        if (isProcessing) return;

        isProcessing = true;
        const originalText = labelEl.textContent;
        const setStatus = (msg) => {
            labelEl.textContent = msg;
        };

        btnEl.style.opacity = '0.85';
        btnEl.style.pointerEvents = 'none';

        try {
            const cfg = getConfig();
            setStatus('Метаданные...');
            const meta = extractVideoMetadata();

            setStatus('Субтитры...');
            const rawSegments = await fetchTranscriptSegmentsFromPlayer(meta.captionTracks);

            const { transcriptMd, groupedBlocks } = groupSegmentsByChaptersOrInterval(
                rawSegments,
                meta.chapters,
                cfg.blockIntervalSec || 180
            );

            let aiResponse = null;

            // Шаг 1: Пробуем меню YouTube «Задать вопрос» прямо на странице
            if (cfg.aiMode === 'auto' || cfg.aiMode === 'youtube-ask') {
                setStatus('Меню YouTube AI...');
                aiResponse = await runYouTubeAskPanelOnPage(cfg.askStrategy, setStatus);
            }

            // Шаг 2: Резервная цепочка (llama.cpp -> OpenRouter -> Gemini)
            if (!aiResponse && ['auto', 'llamacpp', 'openrouter', 'gemini'].includes(cfg.aiMode)) {
                aiResponse = await runFallbackLlmChain(meta, transcriptMd, cfg, setStatus);
            }

            setStatus('Сборка .md...');
            const finalMd = buildSingleFileObsidianMarkdown(meta, transcriptMd, groupedBlocks, aiResponse);

            const baseFilename = `${meta.title} [${meta.videoId}]`;
            saveMarkdownFile(finalMd, baseFilename, cfg);

            setStatus('✓ MD сохранён!');
            await sleep(3000);
        } catch (err) {
            console.error('[YT-Zettel] Ошибка при создании заметки:', err);
            setStatus('Ошибка (см. F12)');
            await sleep(3500);
        } finally {
            labelEl.textContent = originalText;
            btnEl.style.opacity = '1';
            btnEl.style.pointerEvents = 'auto';
            isProcessing = false;
        }
    }

    function createMdButtonElement() {
        const wrapper = document.createElement('div');
        wrapper.id = 'yt-obsidian-md-btn-wrapper';
        wrapper.style.cssText = 'display:inline-flex;align-items:center;margin-left:8px; margin-right:4px;';

        const btn = document.createElement('button');
        btn.id = 'yt-obsidian-md-btn';
        btn.type = 'button';
        btn.title =
            'ЛКМ: Создать единый Zettelkasten .md файл для Obsidian\n' +
            'ПКМ или Shift+ЛКМ: Открыть настройки (llama.cpp / OpenRouter / Gemini / папка сохранения)';
        btn.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'gap:6px',
            'height:36px',
            'padding:0 14px',
            'border-radius:18px',
            'border:1px solid rgba(255,255,255,0.15)',
            'background:rgba(255,255,255,0.1)',
            'color:var(--yt-spec-text-primary, #f1f1f1)',
            'font-family:Roboto, Arial, sans-serif',
            'font-size:14px',
            'font-weight:600',
            'letter-spacing:0.3px',
            'cursor:pointer',
            'transition:background 0.2s ease, transform 0.1s ease'
        ].join(';');

        btn.onmouseenter = () => {
            btn.style.background = 'rgba(124, 58, 237, 0.32)';
            btn.style.borderColor = '#8b5cf6';
        };
        btn.onmouseleave = () => {
            btn.style.background = 'rgba(255,255,255,0.1)';
            btn.style.borderColor = 'rgba(255,255,255,0.15)';
        };

        // Иконка символов Markdown [M↓] + подпись MD
        const iconSpan = document.createElement('span');
        iconSpan.style.cssText =
            'display:inline-flex;align-items:center;justify-content:center;background:#7c3aed;color:#fff;font-size:11px;font-weight:800;padding:2px 5px;border-radius:5px;line-height:1;font-family:monospace;';
        iconSpan.textContent = 'M↓';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = 'MD';

        btn.appendChild(iconSpan);
        btn.appendChild(labelSpan);

        btn.addEventListener('click', (e) => handleMdButtonClick(e, btn, labelSpan));
        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openSettingsModal();
        });

        wrapper.appendChild(btn);
        return wrapper;
    }

    function injectMdButtonUnderVideo() {
        if (!window.location.pathname.startsWith('/watch')) return;
        if (document.getElementById('yt-obsidian-md-btn-wrapper')) return;

        // Ищем панель кнопок под видео (Лайк / Поделиться / Задать вопрос / Скачать)
        const targetContainers = [
            'ytd-watch-metadata #top-level-buttons-computed',
            'ytd-watch-metadata #actions-inner #menu ytd-menu-renderer',
            'ytd-watch-metadata #actions',
            '#above-the-fold #top-level-buttons-computed'
        ];

        for (const selector of targetContainers) {
            const container = document.querySelector(selector);
            if (container) {
                const mdBtn = createMdButtonElement();
                container.insertBefore(mdBtn, container.firstChild);
                return;
            }
        }
    }

    // Следим за переключением видео в SPA YouTube
    window.addEventListener('yt-navigate-finish', () => {
        setTimeout(injectMdButtonUnderVideo, 1000);
    });

    const observer = new MutationObserver(() => {
        if (window.location.pathname.startsWith('/watch') && !document.getElementById('yt-obsidian-md-btn-wrapper')) {
            injectMdButtonUnderVideo();
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(injectMdButtonUnderVideo, 1500);
})();
