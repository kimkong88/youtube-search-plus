/**
 * YouTube Search Plus — Background Service Worker
 *
 * Handles:
 * 1. ExtPay initialization (payments)
 * 2. First-install onboarding — opens YouTube search results page
 * 3. Delivering export data to the Notic web app
 */

import ExtPay from "extpay";

const extpay = ExtPay("youtube-search-plus");
extpay.startBackground();

const NOTIC_APP_URL = "https://app.getnotic.io";

// ── First-install onboarding ──

chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
        // Open YouTube with a sample search so the results page loads
        // and our filter/export buttons inject — ready for the tour.
        chrome.tabs.create({
            url: "https://www.youtube.com/results?search_query=how+to+be+productive",
        });
    }
});

// ── Tab helpers ──

async function findOrOpenNoticTab(): Promise<chrome.tabs.Tab> {
    const allTabs = await chrome.tabs.query({});
    const existing = allTabs.find((t) => t.url?.startsWith(NOTIC_APP_URL));

    if (existing?.id !== undefined) {
        await chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId !== undefined) {
            await chrome.windows.update(existing.windowId, { focused: true });
        }
        return chrome.tabs.get(existing.id);
    }

    return chrome.tabs.create({ url: NOTIC_APP_URL });
}

function waitForTabLoaded(tabId: number, timeoutMs = 10000): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, timeoutMs);

        const listener = (
            updatedId: number,
            changeInfo: chrome.tabs.TabChangeInfo
        ) => {
            if (updatedId === tabId && changeInfo.status === "complete") {
                clearTimeout(timer);
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        };

        chrome.tabs.get(tabId, (tab) => {
            if (tab?.status === "complete") {
                clearTimeout(timer);
                resolve();
            } else {
                chrome.tabs.onUpdated.addListener(listener);
            }
        });
    });
}

// ── Clip delivery ──

async function sendClipToNotic(
    text: string,
    sourceUrl?: string,
    pageTitle?: string
): Promise<boolean> {
    try {
        const tab = await findOrOpenNoticTab();
        if (tab.id === undefined) return false;

        await waitForTabLoaded(tab.id);

        const clipData = { type: "notic-clip", text, sourceUrl, pageTitle };

        // Stash clip in localStorage on the Notic app's origin, then
        // dispatch a custom event. This avoids timing issues — if the
        // app is still hydrating, it picks up the clip on init instead.
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (json: string) => {
                localStorage.setItem("notic-pending-clip", json);
                window.dispatchEvent(new CustomEvent("notic-clip-available"));
            },
            args: [JSON.stringify(clipData)],
        });

        return true;
    } catch (err) {
        console.error("[YSP] Failed to send clip to Notic:", err);
        return false;
    }
}

// ── Message handler ──

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "ysp-export-to-notic") {
        void (async () => {
            const ok = await sendClipToNotic(
                message.text,
                message.sourceUrl,
                message.pageTitle
            );
            sendResponse({ ok });
        })();
        return true; // Keep channel open for async response
    }
});
