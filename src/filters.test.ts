import { describe, it, expect } from "vitest";
import {
    buildQueryString,
    parseQueryFilters,
    buildPreviewLines,
    stripOperators,
    csvEscape,
    type ActiveTextFilter,
} from "./filters";

// ── buildQueryString ─────────────────────────────────────────────────

describe("buildQueryString", () => {
    it("returns empty string for no filters", () => {
        expect(buildQueryString([])).toBe("");
    });

    it("builds after: operator", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-06-15" },
        ];
        expect(buildQueryString(filters)).toBe("after:2024-06-15");
    });

    it("builds before: operator", () => {
        const filters: ActiveTextFilter[] = [
            { id: "before", value: "2024-01-01" },
        ];
        expect(buildQueryString(filters)).toBe("before:2024-01-01");
    });

    it("builds intitle: operator", () => {
        const filters: ActiveTextFilter[] = [
            { id: "intitle", value: "review" },
        ];
        expect(buildQueryString(filters)).toBe("intitle:review");
    });

    it("wraps exact phrase in double quotes", () => {
        const filters: ActiveTextFilter[] = [
            { id: "exact", value: "how to mass delete" },
        ];
        expect(buildQueryString(filters)).toBe('"how to mass delete"');
    });

    it("splits exclude into individual -word operators", () => {
        const filters: ActiveTextFilter[] = [
            { id: "exclude", value: "tutorial beginner" },
        ];
        expect(buildQueryString(filters)).toBe("-tutorial -beginner");
    });

    it("builds channel: (boost channel) operator", () => {
        const filters: ActiveTextFilter[] = [{ id: "channel", value: "mkbhd" }];
        expect(buildQueryString(filters)).toBe("channel:mkbhd");
    });

    it("builds # hashtag operator", () => {
        const filters: ActiveTextFilter[] = [
            { id: "hashtag", value: "shorts" },
        ];
        expect(buildQueryString(filters)).toBe("#shorts");
    });

    it("combines multiple filters with spaces", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
            { id: "before", value: "2024-12-31" },
            { id: "intitle", value: "review" },
            { id: "exclude", value: "sponsored" },
        ];
        expect(buildQueryString(filters)).toBe(
            "after:2024-01-01 before:2024-12-31 intitle:review -sponsored"
        );
    });

    it("skips filters with empty or whitespace-only values", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
            { id: "intitle", value: "   " },
            { id: "channel", value: "" },
        ];
        expect(buildQueryString(filters)).toBe("after:2024-01-01");
    });

    it("trims whitespace from values", () => {
        const filters: ActiveTextFilter[] = [
            { id: "intitle", value: "  review  " },
        ];
        expect(buildQueryString(filters)).toBe("intitle:review");
    });

    it("ignores unknown filter ids", () => {
        const filters: ActiveTextFilter[] = [
            { id: "nonexistent", value: "hello" },
        ];
        expect(buildQueryString(filters)).toBe("");
    });
});

// ── parseQueryFilters ────────────────────────────────────────────────

describe("parseQueryFilters", () => {
    it("returns empty array for plain query", () => {
        expect(parseQueryFilters("python tutorial")).toEqual([]);
    });

    it("parses after: operator", () => {
        const result = parseQueryFilters("python after:2024-06-15");
        expect(result).toContainEqual({ id: "after", value: "2024-06-15" });
    });

    it("parses before: operator", () => {
        const result = parseQueryFilters("python before:2024-01-01");
        expect(result).toContainEqual({ id: "before", value: "2024-01-01" });
    });

    it("parses intitle: operator", () => {
        const result = parseQueryFilters("python intitle:review");
        expect(result).toContainEqual({ id: "intitle", value: "review" });
    });

    it("parses exact phrase in double quotes", () => {
        const result = parseQueryFilters('python "how to learn"');
        expect(result).toContainEqual({
            id: "exact",
            value: "how to learn",
        });
    });

    it("parses multiple exact phrases", () => {
        const result = parseQueryFilters('"hello world" "foo bar"');
        const exactFilters = result.filter((f) => f.id === "exact");
        expect(exactFilters).toHaveLength(2);
        expect(exactFilters[0].value).toBe("hello world");
        expect(exactFilters[1].value).toBe("foo bar");
    });

    it("parses -exclude operators", () => {
        const result = parseQueryFilters("python -tutorial -beginner");
        const exclude = result.find((f) => f.id === "exclude");
        expect(exclude).toBeDefined();
        expect(exclude!.value).toBe("tutorial beginner");
    });

    it("parses channel: operator", () => {
        const result = parseQueryFilters("python channel:mkbhd");
        expect(result).toContainEqual({ id: "channel", value: "mkbhd" });
    });

    it("parses # hashtag operator", () => {
        const result = parseQueryFilters("cooking #shorts");
        expect(result).toContainEqual({ id: "hashtag", value: "shorts" });
    });

    it("parses complex query with multiple operators", () => {
        const query =
            'react hooks after:2024-01-01 before:2024-12-31 intitle:tutorial "best practices" -beginner channel:fireship #webdev';
        const result = parseQueryFilters(query);

        expect(result).toContainEqual({ id: "after", value: "2024-01-01" });
        expect(result).toContainEqual({ id: "before", value: "2024-12-31" });
        expect(result).toContainEqual({ id: "intitle", value: "tutorial" });
        expect(result).toContainEqual({
            id: "exact",
            value: "best practices",
        });
        expect(result.find((f) => f.id === "exclude")).toBeDefined();
        expect(result).toContainEqual({ id: "channel", value: "fireship" });
        expect(result).toContainEqual({ id: "hashtag", value: "webdev" });
    });
});

// ── Roundtrip: build → parse ─────────────────────────────────────────

describe("buildQueryString ↔ parseQueryFilters roundtrip", () => {
    it("roundtrips after filter", () => {
        const original: ActiveTextFilter[] = [
            { id: "after", value: "2024-06-15" },
        ];
        const query = buildQueryString(original);
        const parsed = parseQueryFilters(query);
        expect(parsed).toContainEqual(original[0]);
    });

    it("roundtrips exact phrase", () => {
        const original: ActiveTextFilter[] = [
            { id: "exact", value: "hello world" },
        ];
        const query = buildQueryString(original);
        const parsed = parseQueryFilters(query);
        expect(parsed).toContainEqual(original[0]);
    });

    it("roundtrips exclude words", () => {
        const original: ActiveTextFilter[] = [
            { id: "exclude", value: "spam ads" },
        ];
        const query = buildQueryString(original);
        const parsed = parseQueryFilters(query);
        expect(parsed.find((f) => f.id === "exclude")?.value).toBe("spam ads");
    });

    it("roundtrips channel filter", () => {
        const original: ActiveTextFilter[] = [
            { id: "channel", value: "mkbhd" },
        ];
        const query = buildQueryString(original);
        const parsed = parseQueryFilters(query);
        expect(parsed).toContainEqual(original[0]);
    });
});

// ── buildPreviewLines ────────────────────────────────────────────────

describe("buildPreviewLines", () => {
    it("returns empty array for no filters", () => {
        expect(buildPreviewLines([])).toEqual([]);
    });

    it("first filter has empty connector", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
        ];
        const lines = buildPreviewLines(filters);
        expect(lines[0].connector).toBe("");
    });

    it("subsequent AND filters get AND connector", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
            { id: "before", value: "2024-12-31" },
        ];
        const lines = buildPreviewLines(filters);
        expect(lines[0].connector).toBe("");
        expect(lines[1].connector).toBe("AND");
    });

    it("exclude filters always get NOT connector", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
            { id: "exclude", value: "tutorial beginner" },
        ];
        const lines = buildPreviewLines(filters);
        const excludeLines = lines.filter((l) => l.connector === "NOT");
        expect(excludeLines).toHaveLength(2); // "tutorial" and "beginner"
    });

    it("wraps exact value in quotes", () => {
        const filters: ActiveTextFilter[] = [
            { id: "exact", value: "hello world" },
        ];
        const lines = buildPreviewLines(filters);
        expect(lines[0].value).toBe('"hello world"');
    });

    it("prepends # to hashtag value", () => {
        const filters: ActiveTextFilter[] = [
            { id: "hashtag", value: "shorts" },
        ];
        const lines = buildPreviewLines(filters);
        expect(lines[0].value).toBe("#shorts");
    });

    it("skips filters with empty values", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
            { id: "intitle", value: "  " },
        ];
        const lines = buildPreviewLines(filters);
        expect(lines).toHaveLength(1);
    });

    it("appends Exclude Shorts line when option is set", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
        ];
        const lines = buildPreviewLines(filters, { excludeShorts: true });
        expect(lines).toHaveLength(2);
        expect(lines[1]).toEqual({
            connector: "NOT",
            label: "Shorts",
            value: "",
        });
    });

    it("shows Exclude Shorts as only line when no text filters", () => {
        const lines = buildPreviewLines([], { excludeShorts: true });
        expect(lines).toHaveLength(1);
        expect(lines[0].connector).toBe("NOT");
        expect(lines[0].label).toBe("Shorts");
        expect(lines[0].value).toBe("");
    });

    it("does not append Exclude Shorts when option is false", () => {
        const filters: ActiveTextFilter[] = [
            { id: "after", value: "2024-01-01" },
        ];
        const lines = buildPreviewLines(filters, { excludeShorts: false });
        expect(lines).toHaveLength(1);
    });
});

// ── stripOperators ───────────────────────────────────────────────────

describe("stripOperators", () => {
    it("returns plain query unchanged", () => {
        expect(stripOperators("python tutorial")).toBe("python tutorial");
    });

    it("strips after: operator", () => {
        expect(stripOperators("python after:2024-06-15")).toBe("python");
    });

    it("strips before: operator", () => {
        expect(stripOperators("python before:2024-01-01")).toBe("python");
    });

    it("strips intitle: operator", () => {
        expect(stripOperators("python intitle:review")).toBe("python");
    });

    it("strips exact phrase in quotes", () => {
        expect(stripOperators('python "exact match"')).toBe("python");
    });

    it("strips -exclude operators", () => {
        expect(stripOperators("python -tutorial -beginner")).toBe("python");
    });

    it("strips channel: operator", () => {
        expect(stripOperators("python channel:mkbhd")).toBe("python");
    });

    it("strips # hashtag", () => {
        expect(stripOperators("cooking #shorts")).toBe("cooking");
    });

    it("strips all operators from complex query", () => {
        const query =
            'react hooks after:2024-01-01 before:2024-12-31 intitle:tutorial "best practices" -beginner channel:fireship #webdev';
        expect(stripOperators(query)).toBe("react hooks");
    });

    it("returns empty string when query is only operators", () => {
        expect(stripOperators("after:2024-01-01 before:2024-12-31")).toBe("");
    });

    it("normalises extra whitespace", () => {
        expect(stripOperators("python   after:2024-01-01   tutorial")).toBe(
            "python tutorial"
        );
    });
});

// ── csvEscape ────────────────────────────────────────────────────────

describe("csvEscape", () => {
    it("returns plain string unchanged", () => {
        expect(csvEscape("hello")).toBe("hello");
    });

    it("wraps string with comma in quotes", () => {
        expect(csvEscape("hello, world")).toBe('"hello, world"');
    });

    it("wraps string with double-quote and escapes inner quotes", () => {
        expect(csvEscape('say "hello"')).toBe('"say ""hello"""');
    });

    it("wraps string with newline in quotes", () => {
        expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    });

    it("wraps string with carriage return in quotes", () => {
        expect(csvEscape("line1\rline2")).toBe('"line1\rline2"');
    });

    it("handles empty string", () => {
        expect(csvEscape("")).toBe("");
    });

    it("handles string with comma and quotes combined", () => {
        expect(csvEscape('"Price", $100')).toBe('"""Price"", $100"');
    });
});
