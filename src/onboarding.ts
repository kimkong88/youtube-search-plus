/**
 * YouTube Search Plus — Onboarding
 *
 * Spotlight tour shown on first install.
 * Walks the user through the filter button and export button
 * with a cutout overlay and tooltip cards.
 */

// ── Tour step definitions ──

interface TourStep {
    /** CSS selector for the element to spotlight (null = centered welcome card) */
    target: string | null;
    /** Tooltip title */
    title: string;
    /** Tooltip body text */
    body: string;
    /** Position of tooltip relative to spotlight */
    position: "below" | "above";
    /** Optional action to run when this step activates */
    onEnter?: () => void;
    /** Optional action to run when leaving this step */
    onLeave?: () => void;
}

const TOUR_STEPS: TourStep[] = [
    {
        target: null,
        title: "Welcome to YouTube Search Plus! 🎉",
        body: "Supercharge your YouTube search with advanced filters, templates, and export. Let's take a quick tour.",
        position: "below",
    },
    {
        target: "#ysp-filter-btn",
        title: "Filter Button",
        body: "Click here to add powerful search filters — date ranges, title matching, channel filters, and exclusions.",
        position: "below",
    },
    {
        target: "#ysp-export-btn",
        title: "Export Results",
        body: "Export your search results to CSV or send them to Notic as formatted notes.",
        position: "below",
    },
    {
        target: null,
        title: "You're all set! 🚀",
        body: "Start typing a search query and click the filter button to get started. Happy searching!",
        position: "below",
    },
];

// ── Onboarding class ──

export class Onboarding {
    private overlay: HTMLDivElement | null = null;
    private spotlight: HTMLDivElement | null = null;
    private tooltip: HTMLDivElement | null = null;
    private finger: HTMLDivElement | null = null;
    private currentStep = 0;
    private isActive = false;

    /**
     * Check storage and start the tour if user hasn't been onboarded.
     * Returns true if tour was started.
     */
    async tryStart(): Promise<boolean> {
        const result = await chrome.storage.local.get("ysp_onboarded");
        if (result.ysp_onboarded) return false;

        // Wait a moment for YouTube DOM to settle and our buttons to inject
        await this.waitForElement("#ysp-filter-btn", 8000);

        this.start();
        return true;
    }

    private start() {
        if (this.isActive) return;
        this.isActive = true;
        this.currentStep = 0;

        // Mark as onboarded immediately so it never re-triggers
        // even if the user navigates away mid-tour
        chrome.storage.local.set({ ysp_onboarded: true });

        this.createElements();
        this.showStep(0);

        // Lock body scroll during tour
        document.body.style.overflow = "hidden";
    }

    private finish() {
        this.isActive = false;
        document.body.style.overflow = "";

        // Remove all tour elements
        this.overlay?.remove();
        this.spotlight?.remove();
        this.tooltip?.remove();
        this.finger?.remove();
        this.overlay = null;
        this.spotlight = null;
        this.tooltip = null;
        this.finger = null;

        // Mark as onboarded
        chrome.storage.local.set({ ysp_onboarded: true });
    }

    // ── DOM creation ──

    private createElements() {
        // Overlay (darkened background)
        this.overlay = document.createElement("div");
        this.overlay.className = "ysp-tour-overlay";
        document.body.appendChild(this.overlay);

        // Spotlight cutout
        this.spotlight = document.createElement("div");
        this.spotlight.className = "ysp-tour-spotlight";
        document.body.appendChild(this.spotlight);

        // Finger pointer
        this.finger = document.createElement("div");
        this.finger.className = "ysp-tour-finger";
        this.finger.textContent = "👆";
        document.body.appendChild(this.finger);

        // Tooltip card
        this.tooltip = document.createElement("div");
        this.tooltip.className = "ysp-tour-tooltip";
        document.body.appendChild(this.tooltip);
    }

    // ── Step rendering ──

    private showStep(index: number) {
        const step = TOUR_STEPS[index];
        if (
            !step ||
            !this.tooltip ||
            !this.spotlight ||
            !this.overlay ||
            !this.finger
        )
            return;

        const isFirst = index === 0;
        const isLast = index === TOUR_STEPS.length - 1;

        // Update tooltip content
        this.tooltip.innerHTML = `
            <div class="ysp-tour-tooltip-title">${step.title}</div>
            <div class="ysp-tour-tooltip-body">${step.body}</div>
            <div class="ysp-tour-tooltip-actions">
                <button class="ysp-tour-skip" type="button">${
                    isLast ? "" : "Skip"
                }</button>
                <div class="ysp-tour-dots">
                    ${TOUR_STEPS.map(
                        (_, i) =>
                            `<span class="ysp-tour-dot ${
                                i === index ? "ysp-tour-dot--active" : ""
                            }"></span>`
                    ).join("")}
                </div>
                <button class="ysp-tour-next" type="button">${
                    isLast ? "Get Started" : isFirst ? "Start Tour" : "Next"
                }</button>
            </div>
        `;

        // Wire buttons
        this.tooltip
            .querySelector(".ysp-tour-skip")
            ?.addEventListener("click", () => this.finish());
        this.tooltip
            .querySelector(".ysp-tour-next")
            ?.addEventListener("click", () => {
                if (isLast) {
                    this.finish();
                } else {
                    step.onLeave?.();
                    this.currentStep++;
                    this.showStep(this.currentStep);
                }
            });

        // Position spotlight + tooltip
        if (step.target) {
            const el = document.querySelector(
                step.target
            ) as HTMLElement | null;
            if (el) {
                this.positionOnElement(el, step.position);
                step.onEnter?.();
                return;
            }
        }

        // No target — centered welcome/completion card
        this.spotlight.style.display = "none";
        this.finger.style.display = "none";
        this.tooltip.classList.add("ysp-tour-tooltip--centered");
        this.tooltip.classList.remove("ysp-tour-tooltip--anchored");
    }

    private positionOnElement(el: HTMLElement, position: "below" | "above") {
        if (!this.spotlight || !this.tooltip || !this.finger) return;

        const rect = el.getBoundingClientRect();
        const pad = 8;

        // Spotlight cutout around the element
        this.spotlight.style.display = "block";
        this.spotlight.style.top = `${rect.top - pad}px`;
        this.spotlight.style.left = `${rect.left - pad}px`;
        this.spotlight.style.width = `${rect.width + pad * 2}px`;
        this.spotlight.style.height = `${rect.height + pad * 2}px`;

        // Finger pointer — below the spotlight, pointing up
        this.finger.style.display = "block";
        this.finger.style.top = `${rect.bottom + pad + 2}px`;
        this.finger.style.left = `${rect.left + rect.width / 2 - 12}px`;

        // Tooltip — below the finger
        this.tooltip.classList.remove("ysp-tour-tooltip--centered");
        this.tooltip.classList.add("ysp-tour-tooltip--anchored");

        if (position === "below") {
            this.tooltip.style.top = `${rect.bottom + pad + 40}px`;
            this.tooltip.style.left = `${Math.max(
                12,
                Math.min(
                    rect.left + rect.width / 2 - 160,
                    window.innerWidth - 340
                )
            )}px`;
        } else {
            this.tooltip.style.top = `${rect.top - pad - 160}px`;
            this.tooltip.style.left = `${Math.max(
                12,
                Math.min(
                    rect.left + rect.width / 2 - 160,
                    window.innerWidth - 340
                )
            )}px`;
        }
    }

    // ── Helpers ──

    private waitForElement(
        selector: string,
        timeout: number
    ): Promise<HTMLElement | null> {
        return new Promise((resolve) => {
            const existing = document.querySelector(
                selector
            ) as HTMLElement | null;
            if (existing) {
                resolve(existing);
                return;
            }

            const timer = setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(
                    selector
                ) as HTMLElement | null;
                if (el) {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        });
    }
}
