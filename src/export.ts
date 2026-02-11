/**
 * YouTube Search Plus — Export
 *
 * Export button + panel (anchored to export button, same pattern as filter panel)
 * with format selection, result count config, auto-scroll scraping, and CSV download.
 */

import { isPro, showPaygate, onResetToFree } from "./paygate";
import { csvEscape } from "./filters";

// ── Types ──

interface VideoResult {
    title: string;
    url: string;
    channel: string;
    views: string;
    published: string;
    duration: string;
}

type ExportFormat = "csv" | "notic";

interface ExportField {
    key: keyof VideoResult;
    label: string;
    defaultOn: boolean;
}

const EXPORT_FIELDS: ExportField[] = [
    { key: "title", label: "Title", defaultOn: true },
    { key: "url", label: "URL", defaultOn: true },
    { key: "channel", label: "Channel", defaultOn: true },
    { key: "views", label: "Views", defaultOn: false },
    { key: "published", label: "Published", defaultOn: false },
    { key: "duration", label: "Duration", defaultOn: false },
];

// ── Icons ──

const EXPORT_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/>
</svg>`;

const CSV_ICON = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
  <polyline points="14 2 14 8 20 8"/>
  <line x1="16" y1="13" x2="8" y2="13"/>
  <line x1="16" y1="17" x2="8" y2="17"/>
  <polyline points="10 9 9 9 8 9"/>
</svg>`;

const NOTIC_ICON = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 20h9"/>
  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
</svg>`;

// ── Export Button ──

export class ExportButton {
    private btn: HTMLButtonElement | null = null;
    private panel: HTMLDivElement | null = null;
    private selectedFormat: ExportFormat = "csv";
    private selectedCount = 50;
    private selectedFields: Set<keyof VideoResult> = new Set(
        EXPORT_FIELDS.filter((f) => f.defaultOn).map((f) => f.key)
    );
    private isExporting = false;
    private abortController: AbortController | null = null;
    private onOpenCallback: (() => void) | null = null;

    /** Register a callback invoked when the export panel opens (used to close filter panel). */
    onOpen(cb: () => void) {
        this.onOpenCallback = cb;
    }

    /** Check if a DOM node is inside this export panel (for outside-click exclusion). */
    containsNode(node: Node): boolean {
        return this.panel?.contains(node) ?? false;
    }

    inject(): boolean {
        if (document.getElementById("ysp-export-btn")) return true;

        const filterBtn = document.getElementById("ysp-filter-btn");
        if (!filterBtn) return false;

        this.btn = document.createElement("button");
        this.btn.id = "ysp-export-btn";
        this.btn.type = "button";
        this.btn.title = "Export search results";
        this.btn.innerHTML = EXPORT_ICON;
        this.btn.style.display = "none";

        this.btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        filterBtn.insertAdjacentElement("afterend", this.btn);

        // Build panel once
        if (!this.panel) {
            this.panel = this.buildPanel();
            document.body.appendChild(this.panel);

            // Outside-click to close
            document.addEventListener("click", (e) => {
                const target = e.target as Node;
                if (
                    this.panel?.classList.contains("ysp-open") &&
                    !this.panel.contains(target) &&
                    target !== this.btn &&
                    !this.btn?.contains(target)
                ) {
                    this.close();
                }
            });

            // Reset export panel when subscription lapses
            onResetToFree(() => {
                this.close();
                this.selectedFormat = "notic";
            });
        }

        return true;
    }

    show() {
        if (!this.btn) this.inject();
        if (this.btn) this.btn.style.display = "flex";
    }

    hide() {
        if (this.btn) this.btn.style.display = "none";
    }

    syncVisibility() {
        const params = new URLSearchParams(window.location.search);
        const isResults =
            window.location.pathname.includes("/results") ||
            params.has("search_query");
        if (isResults) this.show();
        else this.hide();
    }

    // ── Panel ──

    private buildPanel(): HTMLDivElement {
        const panel = document.createElement("div");
        panel.id = "ysp-export-panel";

        panel.innerHTML = `
            <div class="ysp-header">
                <div class="ysp-header-left">
                    <h3>Export Results</h3>
                </div>
            </div>
            <div class="ysp-body">
                <!-- Format selector -->
                <div class="ysp-export-section">
                    <div class="ysp-export-label">Format</div>
                    <div class="ysp-export-formats">
                        <button class="ysp-export-format ysp-export-format--active" data-format="csv" type="button">
                            ${CSV_ICON}
                            <span class="ysp-export-format-name">CSV</span>
                        </button>
                        <button class="ysp-export-format" data-format="notic" type="button">
                            ${NOTIC_ICON}
                            <span class="ysp-export-format-name">Notic</span>
                        </button>
                    </div>
                </div>

                <!-- Result count -->
                <div class="ysp-export-section" id="ysp-export-count-section">
                    <div class="ysp-export-label">Number of results</div>
                    <div class="ysp-export-counts">
                        <button class="ysp-export-count" data-count="20" type="button">20</button>
                        <button class="ysp-export-count ysp-export-count--active" data-count="50" type="button">50</button>
                        <button class="ysp-export-count" data-count="100" type="button">100</button>
                        <button class="ysp-export-count" data-count="200" type="button">200</button>
                    </div>
                </div>

                <!-- Fields -->
                <div class="ysp-export-section" id="ysp-export-fields-section">
                    <div class="ysp-export-label">Fields</div>
                    <div class="ysp-export-fields">
                        ${EXPORT_FIELDS.map(
                            (f) => `
                            <label class="ysp-export-field-check">
                                <input type="checkbox" data-field="${f.key}" ${
                                f.defaultOn ? "checked" : ""
                            } />
                                <span>${f.label}</span>
                            </label>`
                        ).join("")}
                    </div>
                </div>

                <!-- Progress -->
                <div class="ysp-export-progress" id="ysp-export-progress" style="display:none;">
                    <div class="ysp-export-progress-bar">
                        <div class="ysp-export-progress-fill" id="ysp-export-progress-fill"></div>
                    </div>
                    <div class="ysp-export-progress-text" id="ysp-export-progress-text">Loading results...</div>
                </div>
            </div>
            <div class="ysp-actions">
                <button class="ysp-btn ysp-btn-clear" id="ysp-export-cancel" type="button">Cancel</button>
                <button class="ysp-btn ysp-btn-apply" id="ysp-export-start" type="button">Export CSV</button>
            </div>
        `;

        // Wire events
        panel
            .querySelector("#ysp-export-cancel")
            ?.addEventListener("click", () => {
                if (this.isExporting) {
                    this.abortController?.abort();
                } else {
                    this.close();
                }
            });
        panel
            .querySelector("#ysp-export-start")
            ?.addEventListener("click", () => this.startExport());

        // Format selection
        panel
            .querySelectorAll<HTMLButtonElement>(".ysp-export-format")
            .forEach((btn) => {
                btn.addEventListener("click", () => {
                    this.selectFormat(btn.dataset.format as ExportFormat);
                });
            });

        // Count selection
        panel
            .querySelectorAll<HTMLButtonElement>(".ysp-export-count")
            .forEach((btn) => {
                btn.addEventListener("click", () => {
                    this.selectCount(parseInt(btn.dataset.count!));
                });
            });

        // Field checkboxes
        panel
            .querySelectorAll<HTMLInputElement>(
                '.ysp-export-field-check input[type="checkbox"]'
            )
            .forEach((cb) => {
                cb.addEventListener("change", () => {
                    const key = cb.dataset.field as keyof VideoResult;
                    if (cb.checked) {
                        this.selectedFields.add(key);
                    } else {
                        // Prevent unchecking all — keep at least one
                        if (this.selectedFields.size > 1) {
                            this.selectedFields.delete(key);
                        } else {
                            cb.checked = true;
                        }
                    }
                });
            });

        return panel;
    }

    private selectFormat(format: ExportFormat) {
        if (!this.panel) return;
        this.selectedFormat = format;

        // Update active state
        this.panel
            .querySelectorAll(".ysp-export-format")
            .forEach((el) =>
                el.classList.toggle(
                    "ysp-export-format--active",
                    (el as HTMLElement).dataset.format === format
                )
            );

        const startBtn = this.panel.querySelector(
            "#ysp-export-start"
        ) as HTMLButtonElement;

        startBtn.textContent =
            format === "notic" ? "Export to Notic" : "Export CSV";
        startBtn.disabled = false;
        startBtn.classList.remove("ysp-btn-disabled");
    }

    private selectCount(count: number) {
        if (!this.panel) return;
        this.selectedCount = count;

        this.panel
            .querySelectorAll(".ysp-export-count")
            .forEach((el) =>
                el.classList.toggle(
                    "ysp-export-count--active",
                    parseInt((el as HTMLElement).dataset.count!) === count
                )
            );
    }

    private toggle() {
        this.panel?.classList.contains("ysp-open")
            ? this.close()
            : this.openPanel();
    }

    private openPanel() {
        if (!this.panel || !this.btn) return;

        // Close filter panel first (mutual exclusivity)
        this.onOpenCallback?.();

        // Reset state
        this.selectFormat("csv");
        this.selectCount(50);
        this.hideProgress();

        // Reset field checkboxes to defaults
        this.selectedFields = new Set(
            EXPORT_FIELDS.filter((f) => f.defaultOn).map((f) => f.key)
        );
        this.panel
            .querySelectorAll<HTMLInputElement>(
                '.ysp-export-field-check input[type="checkbox"]'
            )
            .forEach((cb) => {
                const key = cb.dataset.field as keyof VideoResult;
                cb.checked = this.selectedFields.has(key);
            });

        const startBtn = this.panel.querySelector(
            "#ysp-export-start"
        ) as HTMLButtonElement;
        startBtn.textContent = "Export CSV";
        startBtn.disabled = false;
        startBtn.classList.remove("ysp-btn-disabled");

        const cancelBtn = this.panel.querySelector(
            "#ysp-export-cancel"
        ) as HTMLButtonElement;
        cancelBtn.textContent = "Cancel";

        // Position anchored to export button (same as filter panel)
        const rect = this.btn.getBoundingClientRect();
        this.panel.style.top = `${rect.bottom + 8}px`;
        this.panel.style.left = `${Math.max(8, rect.right - 400)}px`;
        this.panel.classList.add("ysp-open");
    }

    close() {
        if (this.isExporting) {
            this.abortController?.abort();
        }
        this.isExporting = false;
        this.panel?.classList.remove("ysp-open");
    }

    // ── Progress UI ──

    private showProgress(text: string, percent: number) {
        if (!this.panel) return;
        const container = this.panel.querySelector(
            "#ysp-export-progress"
        ) as HTMLElement;
        const fill = this.panel.querySelector(
            "#ysp-export-progress-fill"
        ) as HTMLElement;
        const textEl = this.panel.querySelector(
            "#ysp-export-progress-text"
        ) as HTMLElement;

        container.style.display = "";
        fill.style.width = `${Math.min(100, percent)}%`;
        textEl.textContent = text;
    }

    private hideProgress() {
        if (!this.panel) return;
        const container = this.panel.querySelector(
            "#ysp-export-progress"
        ) as HTMLElement;
        if (container) container.style.display = "none";
    }

    // ── Export flow ──

    private async startExport() {
        if (this.isExporting) return;

        if (this.selectedFormat === "notic") {
            await this.exportToNotic();
            return;
        }

        // CSV export is Pro only
        if (!isPro()) {
            this.close();
            showPaygate("csv");
            return;
        }

        this.isExporting = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const startBtn = this.panel?.querySelector(
            "#ysp-export-start"
        ) as HTMLButtonElement;
        const cancelBtn = this.panel?.querySelector(
            "#ysp-export-cancel"
        ) as HTMLButtonElement;

        startBtn.textContent = "Exporting...";
        startBtn.disabled = true;
        startBtn.classList.add("ysp-btn-disabled");
        cancelBtn.textContent = "Stop";

        try {
            // Auto-scroll to load results
            await this.autoScroll(this.selectedCount, signal);

            if (signal.aborted) {
                this.resetExportUI();
                return;
            }

            // Scrape results
            this.showProgress("Scraping results...", 90);
            const results = this.scrapeResults(this.selectedCount);

            if (results.length === 0) {
                this.showProgress("No results found to export.", 0);
                setTimeout(() => this.resetExportUI(), 2000);
                return;
            }

            // Generate & download CSV
            this.showProgress(`Exporting ${results.length} results...`, 95);

            const query =
                new URLSearchParams(window.location.search).get(
                    "search_query"
                ) || "";
            const csv = this.generateCSV(results, query);
            const safeName = query
                .replace(/[^a-zA-Z0-9]+/g, "_")
                .substring(0, 40);
            this.downloadCSV(csv, `youtube-search_${safeName}.csv`);

            this.showProgress(`Exported ${results.length} results!`, 100);
            setTimeout(() => this.close(), 1500);
        } catch (err) {
            if (!signal.aborted) {
                console.error("[YSP] Export error:", err);
                this.showProgress("Export failed. Try again.", 0);
                setTimeout(() => this.resetExportUI(), 2000);
            }
        } finally {
            this.isExporting = false;
        }
    }

    private resetExportUI() {
        this.isExporting = false;
        this.hideProgress();

        const startBtn = this.panel?.querySelector(
            "#ysp-export-start"
        ) as HTMLButtonElement;
        const cancelBtn = this.panel?.querySelector(
            "#ysp-export-cancel"
        ) as HTMLButtonElement;

        if (startBtn) {
            startBtn.textContent =
                this.selectedFormat === "notic"
                    ? "Export to Notic"
                    : "Export CSV";
            startBtn.disabled = false;
            startBtn.classList.remove("ysp-btn-disabled");
        }
        if (cancelBtn) {
            cancelBtn.textContent = "Cancel";
        }
    }

    // ── Auto-scroll ──

    private async autoScroll(
        target: number,
        signal: AbortSignal
    ): Promise<void> {
        const getCount = () =>
            document.querySelectorAll("ytd-video-renderer").length;

        let current = getCount();
        this.showProgress(
            `Loading results... ${current}/${target}`,
            (current / target) * 100
        );

        if (current >= target) return;

        let staleRounds = 0;
        const MAX_STALE = 3; // give up after 3 rounds with no new results

        while (current < target && !signal.aborted) {
            const prevCount = current;

            // Scroll to bottom
            window.scrollTo({
                top: document.documentElement.scrollHeight,
                behavior: "smooth",
            });

            // Wait for new results to load
            await this.waitForNewResults(prevCount, 4000, signal);

            current = getCount();
            this.showProgress(
                `Loading results... ${Math.min(current, target)}/${target}`,
                (Math.min(current, target) / target) * 100
            );

            if (current === prevCount) {
                staleRounds++;
                if (staleRounds >= MAX_STALE) {
                    // No more results available
                    this.showProgress(
                        `Loaded ${current} results (all available)`,
                        100
                    );
                    break;
                }
            } else {
                staleRounds = 0;
            }
        }
    }

    private waitForNewResults(
        prevCount: number,
        timeout: number,
        signal: AbortSignal
    ): Promise<void> {
        return new Promise((resolve) => {
            const checkInterval = 300;
            let elapsed = 0;

            const check = () => {
                if (signal.aborted) {
                    resolve();
                    return;
                }

                const current =
                    document.querySelectorAll("ytd-video-renderer").length;
                if (current > prevCount || elapsed >= timeout) {
                    resolve();
                    return;
                }

                elapsed += checkInterval;
                setTimeout(check, checkInterval);
            };

            setTimeout(check, checkInterval);
        });
    }

    // ── Scraper ──

    private scrapeResults(maxCount: number): VideoResult[] {
        const renderers = document.querySelectorAll("ytd-video-renderer");
        const results: VideoResult[] = [];

        const limit = Math.min(renderers.length, maxCount);
        for (let i = 0; i < limit; i++) {
            const el = renderers[i];

            const titleEl = el.querySelector(
                "#video-title"
            ) as HTMLElement | null;
            const channelEl = el.querySelector(
                "ytd-channel-name a, #channel-name a"
            ) as HTMLAnchorElement | null;
            const metaSpans = el.querySelectorAll("#metadata-line span");
            const durationEl = el.querySelector(
                "ytd-thumbnail-overlay-time-status-renderer span"
            ) as HTMLElement | null;
            const linkEl = el.querySelector(
                "a#video-title"
            ) as HTMLAnchorElement | null;

            const title = titleEl?.textContent?.trim() || "";
            const url = linkEl?.href || "";
            const channel = channelEl?.textContent?.trim() || "";
            const views =
                (metaSpans[0] as HTMLElement)?.textContent?.trim() || "";
            const published =
                (metaSpans[1] as HTMLElement)?.textContent?.trim() || "";
            const duration = durationEl?.textContent?.trim() || "";

            if (title || url) {
                results.push({
                    title,
                    url,
                    channel,
                    views,
                    published,
                    duration,
                });
            }
        }

        return results;
    }

    // ── CSV generation ──

    private generateCSV(results: VideoResult[], query: string): string {
        const exportDate = new Date().toISOString();

        // Build headers and row mappers based on selected fields
        const activeFields = EXPORT_FIELDS.filter((f) =>
            this.selectedFields.has(f.key)
        );
        const headers = [
            ...activeFields.map((f) => f.label),
            "Search Query",
            "Export Date",
        ];

        const rows = results.map((r) => [
            ...activeFields.map((f) => csvEscape(r[f.key])),
            csvEscape(query),
            csvEscape(exportDate),
        ]);

        const csvContent = [
            headers.map((h) => csvEscape(h)).join(","),
            ...rows.map((r) => r.join(",")),
        ].join("\n");

        // Add BOM for Excel compatibility
        return "\uFEFF" + csvContent;
    }

    private downloadCSV(csv: string, filename: string) {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    // ── Notic export ──

    /**
     * Export visible results to Notic web app as a formatted markdown note.
     * Sends data to YSP's background script, which opens the Notic app tab
     * and injects a window.postMessage — the same mechanism the Notic
     * extension's content script uses, so no Notic extension needed.
     */
    private async exportToNotic() {
        this.isExporting = true;
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const startBtn = this.panel?.querySelector(
            "#ysp-export-start"
        ) as HTMLButtonElement;
        const cancelBtn = this.panel?.querySelector(
            "#ysp-export-cancel"
        ) as HTMLButtonElement;

        startBtn.textContent = "Exporting...";
        startBtn.disabled = true;
        startBtn.classList.add("ysp-btn-disabled");
        cancelBtn.textContent = "Stop";

        try {
            // 1. Auto-scroll to load requested number of results
            await this.autoScroll(this.selectedCount, signal);

            if (signal.aborted) {
                this.resetExportUI();
                return;
            }

            // 2. Scrape results (respects selectedCount)
            this.showProgress("Scraping results...", 70);
            const results = this.scrapeResults(this.selectedCount);

            if (results.length === 0) {
                this.showProgress("No results found to export.", 0);
                setTimeout(() => this.resetExportUI(), 2000);
                return;
            }

            // 3. Build markdown (respects selectedFields)
            const query =
                new URLSearchParams(window.location.search).get(
                    "search_query"
                ) || "";
            const markdown = this.buildNoticMarkdown(results, query);

            // 4. Send to background script → opens Notic app → injects clip
            this.showProgress("Opening Notic...", 85);
            const response = await chrome.runtime.sendMessage({
                type: "ysp-export-to-notic",
                text: markdown,
                sourceUrl: window.location.href,
                pageTitle: `YouTube Search: ${query}`,
            });

            if (response?.ok) {
                this.showProgress(
                    `Exported ${results.length} results to Notic!`,
                    100
                );
                setTimeout(() => this.close(), 1500);
            } else {
                this.showProgress(
                    "Failed to send to Notic. Please try again.",
                    0
                );
                setTimeout(() => this.resetExportUI(), 2000);
            }
        } catch (err) {
            if (!signal.aborted) {
                console.error("[YSP] Notic export error:", err);
                this.showProgress("Export failed. Please try again.", 0);
                setTimeout(() => this.resetExportUI(), 3000);
            }
        } finally {
            this.isExporting = false;
        }
    }

    /**
     * Format search results as a clean markdown note for Notic.
     */
    private buildNoticMarkdown(results: VideoResult[], query: string): string {
        const now = new Date();
        const dateStr = now.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        const timeStr = now.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
        });

        // Get active filters from storage (sync read from inputs)
        const filterChips = document.querySelectorAll(".ysp-result-chip");
        const filters: string[] = [];
        filterChips.forEach((chip) => {
            const text = chip.textContent?.trim();
            if (text) filters.push(text);
        });

        let md = `## YouTube Search: ${query}\n\n`;
        md += `*Exported on ${dateStr} at ${timeStr}*\n\n`;

        if (filters.length > 0) {
            md += `**Filters:** ${filters.join(" · ")}\n\n`;
        }

        md += `---\n\n`;
        md += `### Results (${results.length})\n\n`;

        for (const r of results) {
            // Title + URL are the primary line (if selected)
            const hasTitle = this.selectedFields.has("title");
            const hasUrl = this.selectedFields.has("url");

            if (hasTitle && hasUrl) {
                md += `- [${r.title}](${r.url})`;
            } else if (hasTitle) {
                md += `- ${r.title}`;
            } else if (hasUrl) {
                md += `- ${r.url}`;
            } else {
                md += `- (result)`;
            }

            // Remaining selected fields as metadata line
            const metaKeys: (keyof VideoResult)[] = [
                "channel",
                "views",
                "published",
                "duration",
            ];
            const meta: string[] = [];
            for (const key of metaKeys) {
                if (this.selectedFields.has(key) && r[key]) {
                    meta.push(r[key]);
                }
            }
            if (meta.length > 0) {
                md += `\n  *${meta.join(" · ")}*`;
            }
            md += `\n`;
        }

        md += `\n---\n\n`;
        md += `*${results.length} results · [View on YouTube](${window.location.href})*`;

        return md;
    }
}
