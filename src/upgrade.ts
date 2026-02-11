/**
 * YouTube Search Plus — Upgrade Page
 *
 * Shows Pro features and opens ExtPay payment page on CTA click.
 */

import ExtPay from "extpay";

const extpay = ExtPay("youtube-search-plus");

// Fix icon path
const iconEl = document.getElementById("upgrade-icon") as HTMLImageElement | null;
if (iconEl) iconEl.src = chrome.runtime.getURL("icons/icon-48.png");

// Check if already pro — show different state
extpay.getUser().then((user) => {
    if (user.paid) {
        const btn = document.getElementById("upgrade-cta") as HTMLButtonElement;
        btn.textContent = "You're on Pro — Manage";
        btn.addEventListener("click", () => {
            extpay.openPaymentPage();
        });
    }
}).catch(() => {});

// Upgrade CTA
document.getElementById("upgrade-cta")?.addEventListener("click", () => {
    extpay.openPaymentPage();
});
