/**
 * YouTube Search Plus — Paygate
 *
 * Manages Pro subscription state via ExtPay and the upgrade modal.
 */

import ExtPay from "extpay";

// ── ExtPay instance (content script context) ──
// Note: startBackground() is only called in background.ts.
// In content scripts we only use getUser() / openPaymentPage().

const extpay = ExtPay("youtube-search-plus");

// ── Pro state ──

let proStatus = false;

export function isPro(): boolean {
    return proStatus;
}

/**
 * Load cached pro status from local storage (fast, no network).
 * Call this before injecting UI so buttons appear immediately.
 */
export async function initProStatusFromCache(): Promise<void> {
    const result = await chrome.storage.local.get("ysp_pro_cache");
    proStatus = result.ysp_pro_cache === true;
}

/**
 * Fetch the user's paid status from ExtPay (network call).
 * Call this AFTER UI is injected — it runs in the background.
 */
export async function initProStatus(): Promise<void> {
    try {
        const user = await extpay.getUser();
        proStatus = user.paid === true;
    } catch {
        // Network error — keep whatever cache had
    }
    // Cache for offline fallback
    chrome.storage.local.set({ ysp_pro_cache: proStatus });
}

/** Re-check pro status (call after payment page closes, etc). */
export async function refreshProStatus(): Promise<void> {
    const wasPro = proStatus;
    await initProStatus();

    if (wasPro && !proStatus) {
        freeResetCallbacks.forEach((cb) => cb());
    }
}

/** Listen for pro status changes from the popup or onPaid events. */
export function listenForProChanges(): void {
    // Auto-refresh when ExtPay detects a completed payment
    try {
        extpay.onPaid.addListener(() => {
            proStatus = true;
            chrome.storage.local.set({ ysp_pro_cache: true });
        });
    } catch {
        // onPaid may not be available in all contexts
    }

    // Listen for manual messages from popup
    chrome.runtime.onMessage.addListener((message) => {
        if (message?.type === "ysp-pro-changed") {
            const wasPro = proStatus;
            proStatus = message.isPro === true;
            chrome.storage.local.set({ ysp_pro_cache: proStatus });

            if (wasPro && !proStatus) {
                freeResetCallbacks.forEach((cb) => cb());
            }
        }
    });
}

/** Open ExtPay payment page. */
export function openPaymentPage(): void {
    extpay.openPaymentPage();
}

// ── Free-state reset ──
// Callbacks registered by panel/export to reset their UI when subscription lapses.

type ResetCallback = () => void;
const freeResetCallbacks: ResetCallback[] = [];

/**
 * Register a callback to be invoked when the user's subscription lapses.
 * Used by panel (reset keepAfterSearch, void template selection, disable selector)
 * and export (reset format to Notic) to enforce free-tier restrictions.
 */
export function onResetToFree(cb: ResetCallback): void {
    freeResetCallbacks.push(cb);
}

// ── Feature descriptions for the paygate modal ──

const FEATURE_INFO: Record<string, { title: string; description: string }> = {
    keep: {
        title: "Keep Filters After Search",
        description:
            "Your filters are cleared after each search on the free plan. Upgrade to keep them active across multiple searches.",
    },
    template: {
        title: "Save Filter Templates",
        description:
            "Save your filter combinations as reusable templates. Quickly switch between date ranges, channel filters, and more.",
    },
    csv: {
        title: "Export to CSV",
        description:
            "Download search results as a CSV file for spreadsheets, research, and data analysis.",
    },
};

const PRO_FEATURES = [
    "Keep filters after search",
    "Save & load filter templates",
    "Export results to CSV",
    "Priority support",
];

// ── Icons ──

const LOCK_ICON = `
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
</svg>`;

const CHECK_ICON = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="20 6 9 17 4 12"/>
</svg>`;

// ── Modal ──

let modal: HTMLDivElement | null = null;

function buildModal(): HTMLDivElement {
    const el = document.createElement("div");
    el.id = "ysp-paygate-modal";

    el.innerHTML = `
        <div class="ysp-info-backdrop"></div>
        <div class="ysp-info-content ysp-paygate-content">
            <div class="ysp-paygate-header">
                <div class="ysp-paygate-lock">${LOCK_ICON}</div>
                <h3 id="ysp-paygate-title">Pro Feature</h3>
                <p id="ysp-paygate-desc">Upgrade to unlock this feature.</p>
            </div>
            <div class="ysp-paygate-features">
                <div class="ysp-paygate-features-title">Everything in Pro:</div>
                <ul class="ysp-paygate-list">
                    ${PRO_FEATURES.map(
                        (f) =>
                            `<li class="ysp-paygate-item">${CHECK_ICON}<span>${f}</span></li>`
                    ).join("")}
                </ul>
            </div>
            <div class="ysp-paygate-actions">
                <button class="ysp-btn ysp-btn-clear" id="ysp-paygate-dismiss" type="button">Maybe Later</button>
                <button class="ysp-btn ysp-paygate-upgrade-btn" id="ysp-paygate-upgrade" type="button">Upgrade to Pro</button>
            </div>
        </div>
    `;

    el.querySelector(".ysp-info-backdrop")?.addEventListener(
        "click",
        closePaygate
    );

    el.querySelector(".ysp-info-content")?.addEventListener("click", (e) => {
        e.stopPropagation();
    });

    el.querySelector("#ysp-paygate-dismiss")?.addEventListener(
        "click",
        closePaygate
    );
    el.querySelector("#ysp-paygate-upgrade")?.addEventListener("click", () => {
        window.open(chrome.runtime.getURL("src/upgrade.html"), "_blank");
        closePaygate();
    });

    return el;
}

export function showPaygate(feature: string): void {
    if (!modal) {
        modal = buildModal();
        document.body.appendChild(modal);
    }

    const info = FEATURE_INFO[feature] || {
        title: "Pro Feature",
        description: "Upgrade to unlock this feature.",
    };

    const titleEl = modal.querySelector("#ysp-paygate-title") as HTMLElement;
    const descEl = modal.querySelector("#ysp-paygate-desc") as HTMLElement;
    titleEl.textContent = info.title;
    descEl.textContent = info.description;

    modal.classList.add("ysp-info-open");
    document.body.style.overflow = "hidden";
}

function closePaygate(): void {
    modal?.classList.remove("ysp-info-open");
    document.body.style.overflow = "";
}

/** Check whether a DOM node is inside the paygate modal (used by panel outside-click). */
export function isInsidePaygate(node: Node): boolean {
    return modal?.contains(node) ?? false;
}
