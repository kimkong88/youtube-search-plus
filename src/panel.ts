import {
    TEXT_FILTERS,
    type ActiveTextFilter,
    buildPreviewLines,
} from "./filters";
import { FILTER_ICON } from "./icons";
import { isPro, showPaygate, onResetToFree, isInsidePaygate } from "./paygate";

export interface FilterState {
    text: ActiveTextFilter[];
    keepAfterSearch: boolean;
    excludeShorts: boolean;
}

export interface FilterTemplate {
    name: string;
    filters: ActiveTextFilter[];
    excludeShorts?: boolean;
}

/**
 * Filter panel UI injected into YouTube's search bar.
 */
export class FilterPanel {
    private btn: HTMLButtonElement | null = null;
    private panel: HTMLDivElement | null = null;
    private modal: HTMLDivElement | null = null;
    private templateModal: HTMLDivElement | null = null;
    private textInputs: Map<string, HTMLInputElement> = new Map();
    private excludeShorts = false;
    private keepAfterSearch = false;
    private templates: FilterTemplate[] = [];
    private onSave: (state: FilterState) => void;
    private onOpenCallback: (() => void) | null = null;
    private externalContainsCheck: ((node: Node) => boolean) | null = null;

    constructor(onSave: (state: FilterState) => void) {
        this.onSave = onSave;
    }

    /** Register a callback invoked when the filter panel opens (used to close export panel). */
    onOpen(cb: () => void) {
        this.onOpenCallback = cb;
    }

    /** Register a function that checks if a node is inside an external panel (for outside-click exclusion). */
    setExternalContainsCheck(fn: (node: Node) => boolean) {
        this.externalContainsCheck = fn;
    }

    // ── DOM finders ──

    private findSearchInput(): HTMLInputElement | null {
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

    private findInputBox(): HTMLElement | null {
        const inputBox = document.querySelector<HTMLElement>(
            ".ytSearchboxComponentInputBox"
        );
        if (inputBox) return inputBox;
        const input = this.findSearchInput();
        if (input) {
            let el: HTMLElement | null = input.parentElement;
            while (el) {
                if (
                    el.classList.contains("ytSearchboxComponentInputBox") ||
                    el.id === "search-input" ||
                    el.id === "container"
                )
                    return el;
                el = el.parentElement;
            }
            return input.parentElement;
        }
        return null;
    }

    // ── Injection ──

    inject(): boolean {
        if (document.getElementById("ysp-filter-btn")) return true;

        const inputBox = this.findInputBox();
        if (!inputBox) return false;

        this.btn = document.createElement("button");
        this.btn.id = "ysp-filter-btn";
        this.btn.type = "button";
        this.btn.title = "YouTube Search Plus — Advanced Filters";
        this.btn.innerHTML = FILTER_ICON;
        this.btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggle();
        });

        this.panel = this.buildPanel();
        this.modal = this.buildInfoModal();
        this.templateModal = this.buildTemplateModal();

        inputBox.style.position = "relative";
        inputBox.appendChild(this.btn);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.modal);
        document.body.appendChild(this.templateModal);

        // Register free-tier reset: called when subscription lapses
        onResetToFree(() => this.resetToFree());

        document.addEventListener("click", (e) => {
            const target = e.target as Node;
            if (
                this.panel?.classList.contains("ysp-open") &&
                !this.panel.contains(target) &&
                !this.modal?.contains(target) &&
                !this.templateModal?.contains(target) &&
                !isInsidePaygate(target) &&
                !this.externalContainsCheck?.(target) &&
                target !== this.btn &&
                !this.btn?.contains(target)
            ) {
                this.close();
            }
        });

        this.loadState();
        return true;
    }

    // ── Panel builder ──

    private buildPanel(): HTMLDivElement {
        const panel = document.createElement("div");
        panel.id = "ysp-panel";
        const today = new Date().toISOString().split("T")[0];

        let html = `
            <div class="ysp-header">
                <div class="ysp-header-left">
                    <h3>Search Filters</h3>
                    <span class="ysp-summary" id="ysp-summary"></span>
                </div>
                <div class="ysp-header-right">
                    <div class="ysp-template-selector" id="ysp-template-selector">
                        <button class="ysp-template-trigger" id="ysp-template-trigger" type="button" title="Load template">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                            </svg>
                            <span>Templates</span>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="ysp-template-dropdown" id="ysp-template-dropdown">
                            <div class="ysp-template-list" id="ysp-template-list"></div>
                            <div class="ysp-template-empty" id="ysp-template-empty">No saved templates</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Scrollable body
        html += `<div class="ysp-body">`;

        // Exclude Shorts toggle
        html += `
            <div class="ysp-section ysp-exclude-shorts-section">
                <label class="ysp-exclude-shorts-toggle">
                    <input type="checkbox" id="ysp-exclude-shorts" />
                    <span class="ysp-exclude-shorts-label">Exclude Shorts</span>
                    <span class="ysp-exclude-shorts-hint">Only show regular videos</span>
                </label>
            </div>
        `;

        // Date range
        html += `
            <div class="ysp-section">
                <div class="ysp-section-title">Date Range</div>
                <div class="ysp-row">
                    ${this.fieldHTML("after", today)}
                    ${this.fieldHTML("before", today)}
                </div>
            </div>
        `;

        // Text filters
        html += `
            <div class="ysp-section">
                <div class="ysp-section-title">Text Filters</div>
                ${TEXT_FILTERS.filter(
                    (f) => f.id !== "after" && f.id !== "before"
                )
                    .map((f) => this.fieldHTML(f.id, today))
                    .join("")}
            </div>
        `;

        // Query Preview + Keep toggle + Save template
        html += `
            <div class="ysp-section ysp-preview-section" id="ysp-preview-section" style="display:none;">
                <div class="ysp-section-title">Query Preview</div>
                <div class="ysp-preview" id="ysp-preview"></div>
                <div class="ysp-pro-divider" id="ysp-pro-divider"><span class="ysp-badge ysp-badge-pro">Pro</span></div>
                <div class="ysp-preview-actions">
                    <label class="ysp-keep-toggle" title="Keep these filters active across multiple searches">
                        <input type="checkbox" id="ysp-keep-toggle" />
                        <span class="ysp-keep-label">Keep after search</span>
                    </label>
                    <button class="ysp-save-template-btn" id="ysp-save-template" type="button" title="Save current filters as a reusable template">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                            <polyline points="17 21 17 13 7 13 7 21"/>
                            <polyline points="7 3 7 8 15 8"/>
                        </svg>
                        Save Template
                    </button>
                </div>
            </div>
        `;

        html += `</div>`; // end .ysp-body

        // Actions
        html += `
            <div class="ysp-actions">
                <button class="ysp-btn ysp-btn-clear" id="ysp-clear" type="button">Clear All</button>
                <button class="ysp-btn ysp-btn-apply" id="ysp-apply" type="button">Save Filters</button>
            </div>
        `;

        panel.innerHTML = html;
        setTimeout(() => this.wireEvents(panel), 0);
        return panel;
    }

    private fieldHTML(filterId: string, today: string): string {
        const f = TEXT_FILTERS.find((x) => x.id === filterId);
        if (!f) return "";
        const isDate = f.type === "date";
        const type = isDate ? "date" : "text";
        const maxAttr = isDate ? `max="${today}"` : "";

        return `
            <div class="ysp-field">
                <div class="ysp-field-label">
                    <label for="ysp-input-${f.id}">${f.label}</label>
                    <button class="ysp-info-btn" type="button" data-filter="${
                        f.id
                    }" title="Learn about ${f.label}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                        </svg>
                    </button>
                </div>
                <input type="${type}" id="ysp-input-${
            f.id
        }" ${maxAttr} placeholder="${f.placeholder || ""}" title="${
            f.description || ""
        }" />
            </div>
        `;
    }

    // ── Info Modal ──

    private buildInfoModal(): HTMLDivElement {
        const modal = document.createElement("div");
        modal.id = "ysp-info-modal";
        modal.innerHTML = `
            <div class="ysp-info-backdrop"></div>
            <div class="ysp-info-content">
                <div class="ysp-info-header">
                    <h3 id="ysp-info-title"></h3>
                    <button class="ysp-info-close" type="button">&times;</button>
                </div>
                <div class="ysp-info-body" id="ysp-info-body"></div>
            </div>
        `;
        modal
            .querySelector(".ysp-info-backdrop")
            ?.addEventListener("click", () => this.closeInfoModal());
        modal
            .querySelector(".ysp-info-close")
            ?.addEventListener("click", () => this.closeInfoModal());
        return modal;
    }

    private openInfoModal(filterId: string) {
        const f = TEXT_FILTERS.find((x) => x.id === filterId);
        if (!f || !this.modal) return;

        this.modal.querySelector("#ysp-info-title")!.textContent = f.label;
        this.modal.querySelector("#ysp-info-body")!.innerHTML = `
            <div class="ysp-info-section"><div class="ysp-info-label">What it does</div><p>${f.info.what}</p></div>
            <div class="ysp-info-section"><div class="ysp-info-label">Syntax</div><code class="ysp-info-code">${f.info.example}</code></div>
            <div class="ysp-info-section"><div class="ysp-info-label">Without this filter</div><div class="ysp-info-example ysp-info-without"><span class="ysp-info-icon">🔍</span><span>${f.info.without}</span></div></div>
            <div class="ysp-info-section"><div class="ysp-info-label">With this filter</div><div class="ysp-info-example ysp-info-with"><span class="ysp-info-icon">✅</span><span>${f.info.with}</span></div></div>
        `;
        this.modal.classList.add("ysp-info-open");
        document.body.style.overflow = "hidden";
    }

    private closeInfoModal() {
        this.modal?.classList.remove("ysp-info-open");
        document.body.style.overflow = "";
    }

    // ── Template Modal ──

    private buildTemplateModal(): HTMLDivElement {
        const modal = document.createElement("div");
        modal.id = "ysp-template-modal";
        modal.innerHTML = `
            <div class="ysp-info-backdrop"></div>
            <div class="ysp-info-content ysp-template-modal-content">
                <div class="ysp-info-header">
                    <h3>Save Template</h3>
                    <button class="ysp-info-close" id="ysp-tpl-modal-close" type="button">&times;</button>
                </div>
                <div class="ysp-template-modal-body">
                    <label class="ysp-template-modal-label" for="ysp-template-name">Template name</label>
                    <input type="text" id="ysp-template-name" placeholder="e.g. 2020-2021 Videos" maxlength="30" />
                    <div class="ysp-template-modal-preview" id="ysp-tpl-modal-preview"></div>
                    <div class="ysp-template-modal-actions">
                        <button class="ysp-btn ysp-btn-clear" id="ysp-tpl-modal-cancel" type="button">Cancel</button>
                        <button class="ysp-btn ysp-btn-apply" id="ysp-tpl-modal-save" type="button">Save Template</button>
                    </div>
                </div>
            </div>
        `;

        modal
            .querySelector(".ysp-info-backdrop")
            ?.addEventListener("click", () => this.closeTemplateModal());
        modal
            .querySelector("#ysp-tpl-modal-close")
            ?.addEventListener("click", () => this.closeTemplateModal());
        modal
            .querySelector("#ysp-tpl-modal-cancel")
            ?.addEventListener("click", () => this.closeTemplateModal());
        modal
            .querySelector("#ysp-tpl-modal-save")
            ?.addEventListener("click", () => this.saveTemplate());

        const nameInput = modal.querySelector(
            "#ysp-template-name"
        ) as HTMLInputElement;
        nameInput?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this.saveTemplate();
        });

        return modal;
    }

    private openTemplateModal() {
        if (!this.templateModal) return;

        const nameInput = this.templateModal.querySelector(
            "#ysp-template-name"
        ) as HTMLInputElement;
        if (nameInput) {
            nameInput.value = "";
        }

        // Show a preview of what will be saved
        const preview = this.templateModal.querySelector(
            "#ysp-tpl-modal-preview"
        ) as HTMLElement;
        if (preview) {
            const filters = this.getFiltersFromInputs();
            let chips = filters
                .map((f) => {
                    const config = TEXT_FILTERS.find((c) => c.id === f.id);
                    return `<span class="ysp-tpl-preview-chip">${
                        config?.label || f.id
                    }: ${f.value}</span>`;
                })
                .join("");
            if (this.excludeShorts) {
                chips += `<span class="ysp-tpl-preview-chip">Exclude Shorts</span>`;
            }
            preview.innerHTML = chips;
        }

        this.templateModal.classList.add("ysp-info-open");
        document.body.style.overflow = "hidden";
        setTimeout(() => nameInput?.focus(), 50);
    }

    private closeTemplateModal() {
        this.templateModal?.classList.remove("ysp-info-open");
        document.body.style.overflow = "";
    }

    // ── Wire events ──

    private wireEvents(panel: HTMLDivElement) {
        const today = new Date().toISOString().split("T")[0];

        for (const f of TEXT_FILTERS) {
            const input = panel.querySelector(
                `#ysp-input-${f.id}`
            ) as HTMLInputElement;
            if (input) {
                this.textInputs.set(f.id, input);
                input.addEventListener("input", () => {
                    this.updateSummary();
                    this.updatePreview();
                    if (f.id === "after" || f.id === "before")
                        this.syncDateConstraints(today);
                });
            }
        }

        // Exclude Shorts toggle
        const excludeShortsToggle = panel.querySelector(
            "#ysp-exclude-shorts"
        ) as HTMLInputElement;
        if (excludeShortsToggle) {
            excludeShortsToggle.checked = this.excludeShorts;
            excludeShortsToggle.addEventListener("change", () => {
                this.excludeShorts = excludeShortsToggle.checked;
                this.updateSummary();
                this.updatePreview();
            });
        }

        // Info buttons
        panel
            .querySelectorAll<HTMLButtonElement>(".ysp-info-btn")
            .forEach((btn) => {
                btn.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openInfoModal(btn.dataset.filter!);
                });
            });

        // Keep toggle (Pro only)
        const keepToggle = panel.querySelector(
            "#ysp-keep-toggle"
        ) as HTMLInputElement;
        if (keepToggle) {
            keepToggle.checked = this.keepAfterSearch;
            keepToggle.addEventListener("change", () => {
                if (!isPro() && keepToggle.checked) {
                    keepToggle.checked = false;
                    showPaygate("keep");
                    return;
                }
                this.keepAfterSearch = keepToggle.checked;
                this.saveKeepSetting();
            });
        }

        // Template trigger (dropdown toggle)
        const trigger = panel.querySelector("#ysp-template-trigger");
        const dropdown = panel.querySelector(
            "#ysp-template-dropdown"
        ) as HTMLElement;
        trigger?.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown?.classList.toggle("ysp-dropdown-open");
            if (dropdown?.classList.contains("ysp-dropdown-open"))
                this.renderTemplateList();
        });

        // Close dropdown on outside click (handled by panel's outside click)
        panel.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target.closest("#ysp-template-selector")) {
                dropdown?.classList.remove("ysp-dropdown-open");
            }
        });

        // Save template button → open modal (Pro only)
        panel
            .querySelector("#ysp-save-template")
            ?.addEventListener("click", () => {
                if (!isPro()) {
                    showPaygate("template");
                    return;
                }
                this.openTemplateModal();
            });

        // Actions
        panel
            .querySelector("#ysp-clear")
            ?.addEventListener("click", () => this.clearAll());
        panel
            .querySelector("#ysp-apply")
            ?.addEventListener("click", () => this.save());
    }

    // ── Template management ──

    private saveTemplate() {
        const nameInput = this.templateModal?.querySelector(
            "#ysp-template-name"
        ) as HTMLInputElement;
        const name = nameInput?.value.trim();
        if (!name) return;

        const filters = this.getFiltersFromInputs();
        if (filters.length === 0) return;

        // Check for duplicate name — overwrite
        const existing = this.templates.findIndex((t) => t.name === name);
        if (existing >= 0) {
            this.templates[existing].filters = filters;
            this.templates[existing].excludeShorts = this.excludeShorts;
        } else {
            this.templates.push({
                name,
                filters,
                excludeShorts: this.excludeShorts || undefined,
            });
        }

        this.saveTemplates();
        this.closeTemplateModal();
        this.renderTemplateList();

        // Brief feedback on the save template button
        const btn = this.panel?.querySelector(
            "#ysp-save-template"
        ) as HTMLElement;
        if (btn) {
            const original = btn.innerHTML;
            btn.textContent = "Saved \u2713";
            setTimeout(() => {
                btn.innerHTML = original;
            }, 800);
        }
    }

    private loadTemplate(index: number) {
        const template = this.templates[index];
        if (!template) return;

        // Clear all first
        for (const input of this.textInputs.values()) input.value = "";

        // Populate text filters
        for (const f of template.filters) {
            const input = this.textInputs.get(f.id);
            if (input) input.value = f.value;
        }

        // Restore excludeShorts
        this.excludeShorts = template.excludeShorts || false;
        const excludeShortsToggle = this.panel?.querySelector(
            "#ysp-exclude-shorts"
        ) as HTMLInputElement;
        if (excludeShortsToggle) excludeShortsToggle.checked = this.excludeShorts;

        const today = new Date().toISOString().split("T")[0];
        this.syncDateConstraints(today);
        this.updateSummary();
        this.updatePreview();

        // Close dropdown
        this.panel
            ?.querySelector("#ysp-template-dropdown")
            ?.classList.remove("ysp-dropdown-open");
    }

    private deleteTemplate(index: number) {
        this.templates.splice(index, 1);
        this.saveTemplates();
        this.renderTemplateList();
    }

    private renderTemplateList() {
        const list = this.panel?.querySelector(
            "#ysp-template-list"
        ) as HTMLElement;
        const empty = this.panel?.querySelector(
            "#ysp-template-empty"
        ) as HTMLElement;
        if (!list || !empty) return;

        if (this.templates.length === 0) {
            list.innerHTML = "";
            empty.style.display = "";
            return;
        }

        empty.style.display = "none";
        list.innerHTML = this.templates
            .map((t, i) => {
                const parts = t.filters
                    .map((f) => {
                        const config = TEXT_FILTERS.find((c) => c.id === f.id);
                        return config ? `${config.label}: ${f.value}` : "";
                    })
                    .filter(Boolean);
                if (t.excludeShorts) parts.push("Exclude Shorts");
                const filterSummary = parts.join(", ");

                return `
                <div class="ysp-template-item" data-index="${i}">
                    <div class="ysp-template-item-content" data-action="load" data-index="${i}">
                        <div class="ysp-template-item-name">${t.name}</div>
                        <div class="ysp-template-item-detail">${filterSummary}</div>
                    </div>
                    <button class="ysp-template-item-delete" data-action="delete" data-index="${i}" type="button" title="Delete template">&times;</button>
                </div>
            `;
            })
            .join("");

        // Wire click events
        list.querySelectorAll('[data-action="load"]').forEach((el) => {
            el.addEventListener("click", () => {
                const idx = parseInt(el.getAttribute("data-index")!);
                this.loadTemplate(idx);
            });
        });
        list.querySelectorAll('[data-action="delete"]').forEach((el) => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                const idx = parseInt(el.getAttribute("data-index")!);
                this.deleteTemplate(idx);
            });
        });
    }

    // ── Date constraints ──

    private syncDateConstraints(today: string) {
        const afterInput = this.textInputs.get("after");
        const beforeInput = this.textInputs.get("before");
        if (!afterInput || !beforeInput) return;
        if (afterInput.value) {
            beforeInput.min = afterInput.value;
        } else {
            beforeInput.removeAttribute("min");
        }
        if (beforeInput.value) {
            afterInput.max = beforeInput.value;
        } else {
            afterInput.max = today;
        }
    }

    // ── Summary ──

    private updateSummary() {
        const el = this.panel?.querySelector("#ysp-summary");
        if (!el) return;
        let count = 0;
        for (const input of this.textInputs.values()) {
            if (input.value.trim()) count++;
        }
        if (this.excludeShorts) count++;
        el.textContent = count > 0 ? `${count} active` : "";
        el.classList.toggle("ysp-has-filters", count > 0);
    }

    // ── Query Preview ──

    private getFiltersFromInputs(): ActiveTextFilter[] {
        const filters: ActiveTextFilter[] = [];
        for (const [id, input] of this.textInputs) {
            if (input.value.trim())
                filters.push({ id, value: input.value.trim() });
        }
        return filters;
    }

    private updatePreview() {
        const section = this.panel?.querySelector(
            "#ysp-preview-section"
        ) as HTMLElement;
        const container = this.panel?.querySelector(
            "#ysp-preview"
        ) as HTMLElement;
        if (!section || !container) return;

        const filters = this.getFiltersFromInputs();
        const lines = buildPreviewLines(filters, {
            excludeShorts: this.excludeShorts,
        });

        if (lines.length === 0) {
            section.style.display = "none";
            return;
        }

        section.style.display = "";
        const hasConnectors = lines.some((l) => l.connector);
        container.innerHTML = lines
            .map((line) => {
                const conn = line.connector
                    ? `<span class="ysp-preview-connector ysp-preview-${line.connector.toLowerCase()}">${
                          line.connector
                      }</span>`
                    : hasConnectors
                    ? `<span class="ysp-preview-connector ysp-preview-spacer"></span>`
                    : "";
                return `<div class="ysp-preview-line">${conn}<span class="ysp-preview-label">${line.label}</span><span class="ysp-preview-value">${line.value}</span></div>`;
            })
            .join("");

        // Hide Pro divider when user is Pro (features are unlocked)
        const divider = this.panel?.querySelector(
            "#ysp-pro-divider"
        ) as HTMLElement;
        if (divider) {
            divider.style.display = isPro() ? "none" : "";
        }
    }

    // ── Open / Close ──

    toggle() {
        this.panel?.classList.contains("ysp-open") ? this.close() : this.open();
    }

    open() {
        if (!this.panel || !this.btn) return;

        // Close export panel first (mutual exclusivity)
        this.onOpenCallback?.();

        const rect = this.btn.getBoundingClientRect();
        // Use viewport coordinates (no scroll offset) since panel is position: fixed
        this.panel.style.top = `${rect.bottom + 8}px`;
        this.panel.style.left = `${Math.max(8, rect.right - 400)}px`;
        this.panel.classList.add("ysp-open");
        this.updateSummary();
        this.updatePreview();
    }

    close() {
        this.panel?.classList.remove("ysp-open");
        this.panel
            ?.querySelector("#ysp-template-dropdown")
            ?.classList.remove("ysp-dropdown-open");
    }

    // ── Save / Clear ──

    private save() {
        const filters = this.getFiltersFromInputs();
        this.saveState(filters);
        this.updateButtonState(filters.length > 0 || this.excludeShorts);
        this.onSave({
            text: filters,
            keepAfterSearch: this.keepAfterSearch,
            excludeShorts: this.excludeShorts,
        });

        const applyBtn = this.panel?.querySelector(
            "#ysp-apply"
        ) as HTMLButtonElement;
        if (applyBtn) {
            applyBtn.textContent = "Saved \u2713";
            applyBtn.classList.add("ysp-btn-saved");
            setTimeout(() => {
                applyBtn.textContent = "Save Filters";
                applyBtn.classList.remove("ysp-btn-saved");
                this.close();
            }, 800);
        } else {
            this.close();
        }
    }

    private clearAll() {
        const today = new Date().toISOString().split("T")[0];
        for (const input of this.textInputs.values()) input.value = "";
        const afterInput = this.textInputs.get("after");
        const beforeInput = this.textInputs.get("before");
        if (afterInput) afterInput.max = today;
        if (beforeInput) beforeInput.removeAttribute("min");

        this.excludeShorts = false;
        const excludeShortsToggle = this.panel?.querySelector(
            "#ysp-exclude-shorts"
        ) as HTMLInputElement;
        if (excludeShortsToggle) excludeShortsToggle.checked = false;

        this.keepAfterSearch = false;
        const toggle = this.panel?.querySelector(
            "#ysp-keep-toggle"
        ) as HTMLInputElement;
        if (toggle) toggle.checked = false;
        this.saveKeepSetting();

        this.updateSummary();
        this.updatePreview();
        this.saveState([]);
        this.updateButtonState(false);
        this.onSave({ text: [], keepAfterSearch: false, excludeShorts: false });
    }

    // ── Persistence ──

    private async loadState() {
        try {
            const result = await chrome.storage.local.get([
                "ysp_filters",
                "ysp_keep",
                "ysp_templates",
                "ysp_exclude_shorts",
            ]);
            const filters =
                (result.ysp_filters as ActiveTextFilter[] | undefined) || [];
            this.keepAfterSearch =
                (result.ysp_keep as boolean | undefined) || false;
            this.excludeShorts =
                (result.ysp_exclude_shorts as boolean | undefined) || false;
            this.templates =
                (result.ysp_templates as FilterTemplate[] | undefined) || [];

            for (const f of filters) {
                const input = this.textInputs.get(f.id);
                if (input) input.value = f.value;
            }
            this.updateButtonState(filters.length > 0 || this.excludeShorts);
            const today = new Date().toISOString().split("T")[0];
            this.syncDateConstraints(today);

            // Sync toggle UIs
            const toggle = this.panel?.querySelector(
                "#ysp-keep-toggle"
            ) as HTMLInputElement;
            if (toggle) toggle.checked = this.keepAfterSearch;

            const excludeShortsToggle = this.panel?.querySelector(
                "#ysp-exclude-shorts"
            ) as HTMLInputElement;
            if (excludeShortsToggle) excludeShortsToggle.checked = this.excludeShorts;
        } catch {
            /* ignore */
        }
    }

    private saveState(filters: ActiveTextFilter[]) {
        try {
            chrome.storage.local.set({
                ysp_filters: filters,
                ysp_exclude_shorts: this.excludeShorts,
            });
        } catch {
            /* ignore */
        }
    }

    private saveKeepSetting() {
        try {
            chrome.storage.local.set({ ysp_keep: this.keepAfterSearch });
        } catch {
            /* ignore */
        }
    }

    private saveTemplates() {
        try {
            chrome.storage.local.set({ ysp_templates: this.templates });
        } catch {
            /* ignore */
        }
    }

    private updateButtonState(active: boolean) {
        this.btn?.classList.toggle("ysp-active", active);
    }

    /** Check if keep is enabled */
    get isKeepEnabled(): boolean {
        return this.keepAfterSearch;
    }

    /** Clear filters after search (free tier — skipped if keep is on) */
    clearAfterSearch() {
        if (this.keepAfterSearch) return; // Keep enabled — don't clear

        const today = new Date().toISOString().split("T")[0];
        for (const input of this.textInputs.values()) input.value = "";
        const afterInput = this.textInputs.get("after");
        const beforeInput = this.textInputs.get("before");
        if (afterInput) afterInput.max = today;
        if (beforeInput) beforeInput.removeAttribute("min");

        this.excludeShorts = false;
        const excludeShortsToggle = this.panel?.querySelector(
            "#ysp-exclude-shorts"
        ) as HTMLInputElement;
        if (excludeShortsToggle) excludeShortsToggle.checked = false;

        this.updateSummary();
        this.updatePreview();
        this.saveState([]);
        this.updateButtonState(false);
    }

    /**
     * Reset to free-tier state. Called when subscription lapses.
     * - Turns off keepAfterSearch and unchecks toggle
     * - Clears selected template
     * - Disables template selector
     */
    resetToFree() {
        // Reset exclude shorts
        this.excludeShorts = false;
        const excludeShortsToggle = this.panel?.querySelector(
            "#ysp-exclude-shorts"
        ) as HTMLInputElement;
        if (excludeShortsToggle) excludeShortsToggle.checked = false;

        // Reset keep toggle
        this.keepAfterSearch = false;
        this.saveKeepSetting();
        const keepToggle = this.panel?.querySelector(
            "#ysp-keep-toggle"
        ) as HTMLInputElement | null;
        if (keepToggle) keepToggle.checked = false;

        // Clear template selection (reset dropdown label)
        const trigger = this.panel?.querySelector(
            "#ysp-template-trigger .ysp-template-trigger-label"
        ) as HTMLElement | null;
        if (trigger) trigger.textContent = "Templates";

        // Close template dropdown if open
        const dropdown = this.panel?.querySelector(
            "#ysp-template-dropdown"
        ) as HTMLElement | null;
        dropdown?.classList.remove("ysp-dropdown-open");
    }
}
