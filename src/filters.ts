/**
 * YouTube Search Plus — Filter Definitions
 *
 * Text filters only — these are search query operators that YouTube
 * does NOT expose through its built-in filter UI.
 *
 * YouTube's built-in filters (Sort, Upload Date, Type, Duration, Features)
 * are intentionally NOT included here — they're already available in
 * YouTube's native "Search filters" panel on the results page.
 */

// ─── Text Filter Config ─────────────────────────────────────────────

export interface TextFilterConfig {
    id: string;
    label: string;
    type: "date" | "text";
    operator: string;
    placeholder?: string;
    description?: string;
    /** Education content for the info modal */
    info: {
        what: string;
        example: string;
        without: string;
        with: string;
    };
}

export const TEXT_FILTERS: TextFilterConfig[] = [
    {
        id: "after",
        label: "After",
        type: "date",
        operator: "after:",
        description: "Videos uploaded after this date",
        info: {
            what: 'Only show videos uploaded after a specific date. YouTube\'s built-in filter only offers "This week" or "This month" — this lets you pick an exact date.',
            example: "after:2024-06-15",
            without: "python tutorial → videos from any date",
            with: "python tutorial after:2024-06-15 → only videos from June 15, 2024 onward",
        },
    },
    {
        id: "before",
        label: "Before",
        type: "date",
        operator: "before:",
        description: "Videos uploaded before this date",
        info: {
            what: 'Only show videos uploaded before a specific date. Great for finding older content or narrowing a time window when combined with "After".',
            example: "before:2024-01-01",
            without: "javascript frameworks → videos from any date",
            with: "javascript frameworks before:2024-01-01 → only videos before 2024",
        },
    },
    {
        id: "intitle",
        label: "In Title",
        type: "text",
        operator: "intitle:",
        placeholder: "Word must appear in title",
        description: "Require a word in the video title",
        info: {
            what: "The word MUST appear in the video title, not just the description or tags. Useful when a normal search returns loosely related videos.",
            example: "intitle:review",
            without: "iphone 16 review → may show unboxings, comparisons, etc.",
            with: 'iphone 16 intitle:review → only videos with "review" in the title',
        },
    },
    {
        id: "exact",
        label: "Exact Phrase",
        type: "text",
        operator: '"',
        placeholder: "Exact phrase to match",
        description: "Search for an exact phrase",
        info: {
            what: "Search for an exact sequence of words. Without this, YouTube may rearrange or skip words. Use this when word order matters.",
            example: '"how to mass delete"',
            without:
                'how to mass delete → may show "how to delete" or "mass storage"',
            with: '"how to mass delete" → only results with that exact phrase',
        },
    },
    {
        id: "exclude",
        label: "Exclude",
        type: "text",
        operator: "-",
        placeholder: "Words to exclude (space-separated)",
        description: "Exclude videos containing these words",
        info: {
            what: "Remove videos containing specific words. Add multiple words separated by spaces to exclude all of them.",
            example: "-tutorial -beginner",
            without: "react hooks → includes beginner tutorials",
            with: "react hooks -tutorial -beginner → skips tutorials and beginner content",
        },
    },
    {
        id: "channel",
        label: "Boost Channel",
        type: "text",
        operator: "channel:",
        placeholder: "Channel name or handle",
        description: "Prioritize results from a specific channel",
        info: {
            what: "Prioritizes results from a specific YouTube channel. This is a boost, not a strict filter — videos from the target channel appear first, but other results may still show below.",
            example: "channel:mkbhd",
            without: "best headphones 2025 → results from all channels equally",
            with: "best headphones 2025 channel:mkbhd → MKBHD's videos prioritized at top",
        },
    },
    {
        id: "hashtag",
        label: "Hashtag",
        type: "text",
        operator: "#",
        placeholder: "Tag (without #)",
        description: "Search by hashtag",
        info: {
            what: "Search for videos tagged with a specific hashtag. Creators add hashtags to categorize their videos.",
            example: "#shorts",
            without: "cooking → all cooking videos",
            with: "cooking #shorts → only short-form cooking videos",
        },
    },
];

// ─── Active Filter State ─────────────────────────────────────────────

export interface ActiveTextFilter {
    id: string;
    value: string;
}

// ─── Query String Builder ────────────────────────────────────────────

export function buildQueryString(filters: ActiveTextFilter[]): string {
    const parts: string[] = [];

    for (const f of filters) {
        const config = TEXT_FILTERS.find((c) => c.id === f.id);
        if (!config || !f.value.trim()) continue;

        const val = f.value.trim();

        switch (config.id) {
            case "exact":
                parts.push(`"${val}"`);
                break;
            case "exclude":
                val.split(/\s+/).forEach((word) => parts.push(`-${word}`));
                break;
            case "hashtag":
                parts.push(`#${val}`);
                break;
            default:
                parts.push(`${config.operator}${val}`);
        }
    }

    return parts.join(" ");
}

// ─── Query String Parser ─────────────────────────────────────────────

export function parseQueryFilters(query: string): ActiveTextFilter[] {
    const filters: ActiveTextFilter[] = [];

    const afterMatch = query.match(/after:(\S+)/);
    if (afterMatch) filters.push({ id: "after", value: afterMatch[1] });

    const beforeMatch = query.match(/before:(\S+)/);
    if (beforeMatch) filters.push({ id: "before", value: beforeMatch[1] });

    const intitleMatch = query.match(/intitle:(\S+)/);
    if (intitleMatch) filters.push({ id: "intitle", value: intitleMatch[1] });

    const exactMatches = query.match(/"([^"]+)"/g);
    if (exactMatches) {
        exactMatches.forEach((m) => {
            filters.push({ id: "exact", value: m.replace(/"/g, "") });
        });
    }

    const excludeMatches = query.match(/(?:^|\s)-(\S+)/g);
    if (excludeMatches) {
        const words = excludeMatches.map((m) => m.trim().replace(/^-/, ""));
        if (words.length)
            filters.push({ id: "exclude", value: words.join(" ") });
    }

    const channelMatch = query.match(/channel:(\S+)/);
    if (channelMatch) filters.push({ id: "channel", value: channelMatch[1] });

    const hashtagMatch = query.match(/#(\S+)/);
    if (hashtagMatch) filters.push({ id: "hashtag", value: hashtagMatch[1] });

    return filters;
}

// ─── Strip Operators ─────────────────────────────────────────────────

/**
 * Strip all YSP-managed operators from a query string,
 * leaving only the user's "plain" search terms.
 */
export function stripOperators(query: string): string {
    return query
        .replace(/after:\S+/g, "")
        .replace(/before:\S+/g, "")
        .replace(/intitle:\S+/g, "")
        .replace(/"[^"]+"/g, "")
        .replace(/channel:\S+/g, "")
        .replace(/#\S+/g, "")
        .replace(/(?:^|\s)-\S+/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

// ─── CSV Escape ──────────────────────────────────────────────────────

/**
 * Escape a value for safe CSV inclusion.
 * Wraps in double-quotes and escapes inner quotes when necessary.
 */
export function csvEscape(value: string): string {
    if (
        value.includes(",") ||
        value.includes('"') ||
        value.includes("\n") ||
        value.includes("\r")
    ) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

// ─── Query Preview Builder ───────────────────────────────────────────

export interface PreviewLine {
    connector: "" | "AND" | "NOT";
    label: string;
    value: string;
}

export function buildPreviewLines(
    filters: ActiveTextFilter[],
    options?: { excludeShorts?: boolean },
): PreviewLine[] {
    const lines: PreviewLine[] = [];

    for (const f of filters) {
        const config = TEXT_FILTERS.find((c) => c.id === f.id);
        if (!config || !f.value.trim()) continue;

        const val = f.value.trim();

        switch (config.id) {
            case "exact":
                lines.push({
                    connector: lines.length ? "AND" : "",
                    label: "Exact",
                    value: `"${val}"`,
                });
                break;
            case "exclude":
                val.split(/\s+/).forEach((word) => {
                    lines.push({
                        connector: "NOT",
                        label: "Exclude",
                        value: word,
                    });
                });
                break;
            case "after":
                lines.push({
                    connector: lines.length ? "AND" : "",
                    label: "After",
                    value: val,
                });
                break;
            case "before":
                lines.push({
                    connector: lines.length ? "AND" : "",
                    label: "Before",
                    value: val,
                });
                break;
            case "intitle":
                lines.push({
                    connector: lines.length ? "AND" : "",
                    label: "In Title",
                    value: val,
                });
                break;
            case "channel":
                lines.push({
                    connector: lines.length ? "AND" : "",
                    label: "Boost Channel",
                    value: val,
                });
                break;
            case "hashtag":
                lines.push({
                    connector: lines.length ? "AND" : "",
                    label: "Hashtag",
                    value: `#${val}`,
                });
                break;
        }
    }

    if (options?.excludeShorts) {
        lines.push({
            connector: "NOT",
            label: "Shorts",
            value: "",
        });
    }

    return lines;
}
