/**
 * YouTube Search Plus — Popup
 *
 * Extension icon popup with plan management and quick actions.
 * Uses ExtPay to check subscription status.
 */

import ExtPay from "extpay";

const extpay = ExtPay("youtube-search-plus");

// ── Plan status ──

async function loadPlanStatus(): Promise<boolean> {
    try {
        const user = await extpay.getUser();
        return user.paid === true;
    } catch {
        // Fallback to cache if offline
        const result = await chrome.storage.local.get("ysp_pro_cache");
        return result.ysp_pro_cache === true;
    }
}

function renderPlanCard(isPro: boolean) {
    const card = document.getElementById("plan-card")!;
    const icon = document.getElementById("plan-icon")!;
    const name = document.getElementById("plan-name")!;
    const desc = document.getElementById("plan-desc")!;
    const action = document.getElementById("plan-action")!;

    if (isPro) {
        card.className = "popup-plan popup-plan--pro";
        icon.textContent = "\u2B50";
        name.textContent = "Pro Plan";
        desc.textContent = "All features unlocked";
        action.innerHTML = `<button class="popup-manage-btn" id="manage-btn">Manage</button>`;

        document
            .getElementById("manage-btn")
            ?.addEventListener("click", async () => {
                try {
                    await extpay.openPaymentPage();
                } catch {}
                window.close();
            });
    } else {
        card.className = "popup-plan popup-plan--free";
        icon.textContent = "\uD83D\uDD0D";
        name.textContent = "Free Plan";
        desc.textContent = "Basic filters & Notic export";
        action.innerHTML = `<button class="popup-upgrade-btn" id="upgrade-btn">Upgrade</button>`;

        document
            .getElementById("upgrade-btn")
            ?.addEventListener("click", () => {
                chrome.tabs.create({
                    url: chrome.runtime.getURL("src/upgrade.html"),
                });
                window.close();
            });
    }
}

// ── Actions ──

document.getElementById("open-youtube")?.addEventListener("click", () => {
    chrome.tabs.create({ url: "https://www.youtube.com" });
    window.close();
});

document.getElementById("replay-tour")?.addEventListener("click", async () => {
    await chrome.storage.local.remove("ysp_onboarded");
    chrome.tabs.create({
        url: "https://www.youtube.com/results?search_query=how+to+be+productive",
    });
    window.close();
});

// ── Init ──

(async () => {
    // Fix icon path
    const iconEl = document.getElementById(
        "popup-icon"
    ) as HTMLImageElement | null;
    if (iconEl) iconEl.src = chrome.runtime.getURL("icons/icon-48.png");

    const isPro = await loadPlanStatus();
    renderPlanCard(isPro);

    // Swap skeleton for real card
    const skeleton = document.getElementById("plan-skeleton");
    const card = document.getElementById("plan-card");
    if (skeleton) skeleton.style.display = "none";
    if (card) card.style.display = "";
})();
