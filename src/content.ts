import "./styles/content.css";
import { FilterPanel, type FilterState } from "./panel";
import { ExportButton } from "./export";
import { Onboarding } from "./onboarding";
import {
    initProStatusFromCache,
    initProStatus,
    listenForProChanges,
} from "./paygate";
import {
    type ActiveTextFilter,
    buildQueryString,
    stripOperators,
} from "./filters";

/**
 * YouTube Search Plus — Content Script
 *
 * Flow:
 *   1. User opens filter panel, configures text operators, clicks "Save Filters"
 *   2. Filters saved to chrome.storage
 *   3. User types query in YouTube's search bar and hits Enter/Search
 *   4. Text operators auto-appended to the query at submission time
 *   5. After results load → saved filters cleared (free tier)
 *
 * Text operators (after:, before:, intitle:, "exact", -exclude,
 * channel:, #hashtag) are appended to the query string.
 * Native filters (Exclude Shorts) use YouTube's sp= URL parameter.
 */

const exportBtn = new ExportButton();
const onboarding = new Onboarding();
let panel: FilterPanel;

let savedFilters: ActiveTextFilter[] = [];
let excludeShorts = false;
let keepAfterSearch = false;
let filtersAppliedThisSearch = false;

// ── Search input helpers ──

function findSearchInput(): HTMLInputElement | null {
    return (
        document.querySelector<HTMLInputElement>(
            "input.ytSearchboxComponentInput"
        ) ||
        document.querySelector<HTMLInputElement>(
            'input[name="search_query"]'
        ) ||
        document.querySelector<HTMLInputElement>("input#search")
    );
}

// ── Save callback ──

function handleSave(state: FilterState) {
    savedFilters = state.text;
    excludeShorts = state.excludeShorts;
    keepAfterSearch = state.keepAfterSearch;
}

// ── Search interception ──

function interceptSearch() {
    // Enter key
    document.addEventListener(
        "keydown",
        (e) => {
            if (e.key === "Enter" && isSearchInput(e.target as HTMLElement)) {
                handleSearchTrigger(e);
            }
        },
        true
    );

    // Search button click
    document.addEventListener(
        "click",
        (e) => {
            const target = e.target as HTMLElement;
            if (
                target.closest(
                    ".ytSearchboxComponentSearchButton, #search-icon-legacy"
                )
            ) {
                handleSearchTrigger(e);
            }
        },
        true
    );

    // Form submit (backup)
    document.addEventListener(
        "submit",
        (e) => {
            const form = e.target as HTMLFormElement;
            if (
                form.id?.includes("search") ||
                form.action?.includes("results")
            ) {
                handleSearchTrigger(e);
            }
        },
        true
    );
}

function isSearchInput(el: HTMLElement): boolean {
    return (
        el.classList?.contains("ytSearchboxComponentInput") ||
        el.getAttribute("name") === "search_query" ||
        el.id === "search"
    );
}

/** YouTube sp= parameter value for Type: Video (excludes Shorts) */
const SP_TYPE_VIDEO = "EgIQAQ==";

function handleSearchTrigger(e?: Event) {
    const hasTextFilters = savedFilters.length > 0;

    if (!hasTextFilters && !excludeShorts) return;

    const input = findSearchInput();
    if (!input) return;

    const rawQuery = stripOperators(input.value);
    const filterString = hasTextFilters ? buildQueryString(savedFilters) : "";
    const fullQuery = [rawQuery, filterString].filter(Boolean).join(" ");

    if (!fullQuery.trim()) return;

    if (excludeShorts) {
        // Prevent YouTube's default navigation — we build the URL ourselves
        // to include the sp= parameter for native filtering
        e?.preventDefault();
        e?.stopPropagation();
        // Flag survives the full page reload so clearFiltersAfterSearch() fires
        sessionStorage.setItem("ysp_applied", "1");
        const url = new URL("/results", window.location.origin);
        url.searchParams.set("search_query", fullQuery);
        url.searchParams.set("sp", SP_TYPE_VIDEO);
        window.location.href = url.toString();
    } else {
        // Text-only filters: modify input and let YouTube handle navigation
        input.value = fullQuery;
        input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    filtersAppliedThisSearch = true;
}

// ── Post-search: clear filters (free tier) ──

/**
 * FREE TIER: filters cleared after each search (one-time use).
 * "Keep after search" toggle: skips clearing when enabled.
 * PREMIUM (future): saved templates persist until manually changed.
 */
function clearFiltersAfterSearch() {
    if (!filtersAppliedThisSearch) return;

    filtersAppliedThisSearch = false;

    if (keepAfterSearch) return;

    savedFilters = [];
    excludeShorts = false;
    panel.clearAfterSearch();
}

// ── Initialization ──

async function init() {
    // Load cached pro status first (fast, no network — UI appears immediately)
    await initProStatusFromCache();
    listenForProChanges();

    panel = new FilterPanel(handleSave);

    // Mutual exclusivity: close one panel when the other opens
    exportBtn.onOpen(() => panel.close());
    panel.onOpen(() => exportBtn.close());
    panel.setExternalContainsCheck((node) => exportBtn.containsNode(node));

    if (!panel.inject()) {
        const observer = new MutationObserver((_mutations, obs) => {
            if (panel.inject()) {
                obs.disconnect();
                showExportIfOnResults();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    } else {
        showExportIfOnResults();
    }

    // Load saved filters + preferences from storage
    chrome.storage.local.get(
        ["ysp_filters", "ysp_keep", "ysp_exclude_shorts"],
        (result) => {
            savedFilters = result.ysp_filters || [];
            excludeShorts = result.ysp_exclude_shorts || false;
            keepAfterSearch = result.ysp_keep || false;
        },
    );

    // Restore filtersAppliedThisSearch after full-page reload (sp= navigation)
    if (sessionStorage.getItem("ysp_applied")) {
        sessionStorage.removeItem("ysp_applied");
        filtersAppliedThisSearch = true;
    }

    interceptSearch();
    observeNavigation();

    // Refresh pro status from ExtPay in background (non-blocking)
    initProStatus();
}

function showExportIfOnResults() {
    const params = new URLSearchParams(window.location.search);
    const isResults = params.has("search_query");

    // Inject export button (needs filter button to exist first)
    exportBtn.inject();

    if (isResults) {
        setTimeout(() => {
            exportBtn.show();
            clearFiltersAfterSearch();

            // Try onboarding (no-op if already completed)
            onboarding.tryStart();
        }, 500);
    } else {
        exportBtn.hide();
    }
}

function observeNavigation() {
    document.addEventListener("yt-navigate-finish", () => {
        panel.inject();
        showExportIfOnResults();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
