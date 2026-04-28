const BOOK_PATH = "Gates_of_Okinawa.epub";

const BOOK_TITLE = "Gates of Okinawa";
const SPLASH_DURATION_MS = 1500;
const HUD_AUTOHIDE_DELAY = 2200;
const DEFAULT_FONT_SIZE = 130;
const MIN_FONT_SIZE = 80;
const MAX_FONT_SIZE = 180;
const FONT_STEP = 10;

const STORAGE_KEYS = {
    readerLocation: "gatesOfOkinawa.reading.position",
    readerTheme: "gatesOfOkinawa.reading.theme",
    readerFontSize: "gatesOfOkinawa.reading.fontSize",
};

const LEGACY_STORAGE_KEYS = {
    readerLocation: "gatesOkinawa.reading.position",
    readerTheme: "gatesOkinawa.reading.theme",
    readerFontSize: "gatesOkinawa.reading.fontSize",
};

function safeStorageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        console.warn("Could not read from localStorage:", error);
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        console.warn("Could not write to localStorage:", error);
    }
}

function safeStorageRemove(key) {
    try {
        window.localStorage.removeItem(key);
    } catch (error) {
        console.warn("Could not remove localStorage item:", error);
    }
}

function migrateStorageKey(oldKey, newKey) {
    const existingValue = safeStorageGet(newKey);
    const legacyValue = safeStorageGet(oldKey);

    if (existingValue === null && legacyValue !== null) {
        safeStorageSet(newKey, legacyValue);
    }

    if (legacyValue !== null) {
        safeStorageRemove(oldKey);
    }
}

function migrateReaderStorageKeys() {
    migrateStorageKey(LEGACY_STORAGE_KEYS.readerLocation, STORAGE_KEYS.readerLocation);
    migrateStorageKey(LEGACY_STORAGE_KEYS.readerTheme, STORAGE_KEYS.readerTheme);
    migrateStorageKey(LEGACY_STORAGE_KEYS.readerFontSize, STORAGE_KEYS.readerFontSize);
}

function loadStoredFontSize() {
    const storedValue = Number(safeStorageGet(STORAGE_KEYS.readerFontSize));
    if (!Number.isFinite(storedValue)) {
        return DEFAULT_FONT_SIZE;
    }

    return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, storedValue));
}

function loadStoredTheme() {
    const storedTheme = safeStorageGet(STORAGE_KEYS.readerTheme);
    return storedTheme || "dark";
}

migrateReaderStorageKeys();

const state = {
    currentFontSize: loadStoredFontSize(),
    currentTheme: loadStoredTheme(),
    splashDismissed: false,
    bookNav: [],
    hudAutoHideTimer: null,
    lastHudToggle: 0,
    currentProgress: 0,
};

const elements = {
    body: document.body,
    appContainer: document.getElementById("app-container"),
    splash: document.getElementById("dev-splash"),
    viewer: document.getElementById("viewer"),
    hudTop: document.getElementById("hud-top"),
    hudBottom: document.getElementById("hud-bottom"),
    menuButton: document.getElementById("menu-btn"),
    menuCloseButton: document.getElementById("menu-close-btn"),
    sideMenu: document.getElementById("side-menu"),
    tocList: document.getElementById("toc-list"),
    locationIndicator: document.getElementById("location-indicator"),
    progressFill: document.getElementById("progress-fill"),
    fullscreenButton: document.getElementById("fullscreen-btn"),
    fontDecreaseButton: document.getElementById("font-decrease"),
    fontIncreaseButton: document.getElementById("font-increase"),
    themeButtons: Array.from(document.querySelectorAll("[data-theme]")),
};

let book = null;
let rendition = null;

function updateLocationIndicator(text) {
    if (elements.locationIndicator) {
        elements.locationIndicator.textContent = text;
    }
}

function updateHudHint(text) {
    const hudHint = document.getElementById("hud-hint");
    if (hudHint) {
        hudHint.textContent = text;
    }
}

function updateProgressIndicator(percentage) {
    state.currentProgress = Math.max(0, Math.min(100, percentage));

    if (elements.progressFill) {
        elements.progressFill.style.width = `${state.currentProgress}%`;
    }
}

function showHUD() {
    elements.hudTop?.classList.add("visible");
    elements.hudBottom?.classList.add("visible");
}

function hideHUD() {
    if (elements.sideMenu?.classList.contains("open")) {
        return;
    }

    elements.hudTop?.classList.remove("visible");
    elements.hudBottom?.classList.remove("visible");
}

function clearHudHideTimer() {
    if (state.hudAutoHideTimer) {
        window.clearTimeout(state.hudAutoHideTimer);
        state.hudAutoHideTimer = null;
    }
}

function scheduleHudHide() {
    clearHudHideTimer();
    state.hudAutoHideTimer = window.setTimeout(() => {
        hideHUD();
        state.hudAutoHideTimer = null;
    }, HUD_AUTOHIDE_DELAY);
}

function toggleHUD() {
    const shouldShow = !elements.hudTop?.classList.contains("visible");

    if (shouldShow) {
        showHUD();
    } else {
        hideHUD();
    }

    state.lastHudToggle = Date.now();

    if (isFullscreen() && shouldShow) {
        scheduleHudHide();
    } else if (!shouldShow) {
        clearHudHideTimer();
    }
}

function openSideMenu() {
    elements.sideMenu?.classList.add("open");
    elements.menuButton?.setAttribute("aria-expanded", "true");
    showHUD();
    clearHudHideTimer();
}

function closeSideMenu() {
    elements.sideMenu?.classList.remove("open");
    elements.menuButton?.setAttribute("aria-expanded", "false");

    if (isFullscreen()) {
        scheduleHudHide();
    }
}

function isFullscreen() {
    return Boolean(
        document.fullscreenElement ||
            document.webkitFullscreenElement ||
            document.msFullscreenElement
    );
}

function performInitialDisplay() {
    if (!rendition) {
        showHUD();
        return;
    }

    const savedLocation = safeStorageGet(STORAGE_KEYS.readerLocation);
    const initialDisplay = savedLocation ? rendition.display(savedLocation) : rendition.display();

    Promise.resolve(initialDisplay)
        .then(() => {
            showHUD();
            if (isFullscreen()) {
                scheduleHudHide();
            }
        })
        .catch((error) => {
            console.warn("Could not restore reading position, falling back to book start:", error);
            Promise.resolve(rendition.display())
                .then(() => {
                    showHUD();
                })
                .catch(() => {});
        });
}

function clearSplash() {
    if (!elements.splash || state.splashDismissed) {
        elements.body.classList.remove("splash-active");
        return;
    }

    state.splashDismissed = true;
    elements.splash.classList.add("splash-hidden");
    elements.body.classList.remove("splash-active");

    window.setTimeout(() => {
        elements.splash?.remove();
    }, 420);
}

function dismissSplash() {
    clearSplash();
    performInitialDisplay();
}

function showStartupError(title, details) {
    clearSplash();
    updateProgressIndicator(0);
    updateLocationIndicator(title);
    updateHudHint("Reader setup required");

    if (elements.viewer) {
        elements.viewer.innerHTML = `
            <section class="viewer-status" role="alert">
                <div class="viewer-status-card">
                    <p class="viewer-status-kicker">Reader unavailable</p>
                    <h2>${title}</h2>
                    <p>${details}</p>
                    <a class="button-link primary-link" href="index.html">Back Home</a>
                </div>
            </section>
        `;
    }

    showHUD();
}

function flattenNavigation(items, depth = 0, output = []) {
    items.forEach((item) => {
        if (!item) {
            return;
        }

        output.push({
            id: item.id,
            label: item.label || "(untitled)",
            href: item.href,
            depth,
        });

        const childItems = Array.from(item.subitems || []);
        if (childItems.length > 0) {
            flattenNavigation(childItems, depth + 1, output);
        }
    });

    return output;
}

function buildToc(nav) {
    if (!elements.tocList) {
        return;
    }

    const items = Array.from(nav?.toc || nav || []);
    state.bookNav = flattenNavigation(items);
    elements.tocList.innerHTML = "";

    state.bookNav.forEach((chapter) => {
        const listItem = document.createElement("li");
        const button = document.createElement("button");

        button.type = "button";
        button.textContent = chapter.label;
        button.style.setProperty("--toc-depth", String(chapter.depth || 0));
        button.addEventListener("click", () => {
            rendition.display(chapter.href);
            closeSideMenu();
        });

        listItem.appendChild(button);
        elements.tocList.appendChild(listItem);
    });

    if (state.bookNav.length === 0) {
        updateLocationIndicator(`Opened ${BOOK_TITLE}, but no table of contents was found.`);
    }
}

function sectionToNavIndex(sectionHref) {
    if (!sectionHref || state.bookNav.length === 0) {
        return -1;
    }

    const decodedSection = decodeURIComponent(sectionHref).toLowerCase();

    for (let index = 0; index < state.bookNav.length; index += 1) {
        const navItem = state.bookNav[index];
        const navHref = decodeURIComponent(navItem.href || "").toLowerCase();

        if (!navHref) {
            continue;
        }

        if (
            decodedSection === navHref ||
            decodedSection.includes(navHref) ||
            navHref.includes(decodedSection)
        ) {
            return index;
        }
    }

    return -1;
}

function getThemeOverrideValues() {
    if (state.currentTheme === "light") {
        return {
            background: "#F7F0EB",
            text: "#243331",
            link: "#1A5153",
        };
    }

    if (state.currentTheme === "sepia") {
        return {
            background: "#F3CDA9",
            text: "#382A26",
            link: "#7E372F",
        };
    }

    return {
        background: "#10201E",
        text: "#F7F0EB",
        link: "#F3CDA9",
    };
}

function applyReaderOverrides(sizeStr) {
    try {
        const views = rendition?.manager?.views || [];
        const theme = getThemeOverrideValues();
        const css = `
            html, body {
                background: ${theme.background} !important;
                color: ${theme.text} !important;
            }

            body,
            section,
            article,
            aside,
            main,
            p,
            div,
            span,
            li,
            dt,
            dd,
            blockquote,
            figcaption,
            h1,
            h2,
            h3,
            h4,
            h5,
            h6,
            td,
            th {
                color: ${theme.text} !important;
                font-size: ${sizeStr} !important;
            }

            a,
            a span {
                color: ${theme.link} !important;
            }
        `;

        views.forEach((view) => {
            try {
                const doc = view.document || view.iframe?.contentDocument;
                if (!doc) {
                    return;
                }

                let styleTag = doc.getElementById("user-font-override");
                if (!styleTag) {
                    styleTag = doc.createElement("style");
                    styleTag.id = "user-font-override";
                    (doc.head || doc.documentElement).appendChild(styleTag);
                }

                styleTag.textContent = css;
            } catch (error) {
                console.warn("Could not apply per-view reader overrides:", error);
            }
        });
    } catch (error) {
        console.warn("applyReaderOverrides failed:", error);
    }
}

function updateFontControlState() {
    if (elements.fontDecreaseButton) {
        elements.fontDecreaseButton.disabled = state.currentFontSize <= MIN_FONT_SIZE;
    }

    if (elements.fontIncreaseButton) {
        elements.fontIncreaseButton.disabled = state.currentFontSize >= MAX_FONT_SIZE;
    }
}

function changeFontSize(stepDirection) {
    const nextSize = state.currentFontSize + stepDirection * FONT_STEP;
    state.currentFontSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, nextSize));
    const sizeStr = `${state.currentFontSize}%`;

    try {
        if (rendition?.themes?.fontSize) {
            rendition.themes.fontSize(sizeStr);
        }
    } catch (error) {
        console.warn("rendition.themes.fontSize failed:", error);
    }

    safeStorageSet(STORAGE_KEYS.readerFontSize, String(state.currentFontSize));
    applyReaderOverrides(sizeStr);
    updateFontControlState();
}

function updateThemeButtons() {
    elements.themeButtons.forEach((button) => {
        const isActive = button.dataset.theme === state.currentTheme;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function setTheme(themeName) {
    state.currentTheme = themeName;
    safeStorageSet(STORAGE_KEYS.readerTheme, themeName);

    elements.body.classList.remove("theme-light", "theme-sepia", "theme-dark");

    try {
        if (themeName === "light") {
            rendition.themes.select("light");
            elements.body.classList.add("theme-light");
        } else if (themeName === "sepia") {
            rendition.themes.select("sepia");
            elements.body.classList.add("theme-sepia");
        } else {
            rendition.themes.select("dark");
            elements.body.classList.add("theme-dark");
        }
    } catch (error) {
        console.warn("Could not set theme:", error);
    }

    updateThemeButtons();
    applyReaderOverrides(`${state.currentFontSize}%`);
}

function attachIframeInteractions(view) {
    const iframe = view?.iframe;
    const doc = iframe?.contentDocument;

    if (!iframe || !doc) {
        return;
    }

    const hammer = new Hammer(doc.documentElement);

    hammer.on("swipeleft", () => rendition.next());
    hammer.on("swiperight", () => rendition.prev());

    hammer.on("tap", (event) => {
        const width = doc.documentElement?.clientWidth || iframe.clientWidth || window.innerWidth;
        const xPosition = event.center.x;

        if (xPosition > width * 0.2 && xPosition < width * 0.8) {
            toggleHUD();
        } else if (xPosition <= width * 0.2) {
            rendition.prev();
        } else {
            rendition.next();
        }
    });

    applyReaderOverrides(`${state.currentFontSize}%`);
}

function attachViewerClickFallback(view) {
    const iframe = view?.iframe;
    if (!iframe || !elements.viewer) {
        return;
    }

    if (elements.viewer._hudClickListener) {
        elements.viewer.removeEventListener("click", elements.viewer._hudClickListener);
    }

    elements.viewer._hudClickListener = (event) => {
        if (state.lastHudToggle && Date.now() - state.lastHudToggle < 400) {
            return;
        }

        try {
            const rect = iframe.getBoundingClientRect();
            const width = rect.width || window.innerWidth;
            const xPosition = event.clientX - rect.left;

            if (xPosition > width * 0.2 && xPosition < width * 0.8) {
                toggleHUD();
            } else if (xPosition <= width * 0.2) {
                rendition.prev();
            } else {
                rendition.next();
            }
        } catch (error) {
            console.warn("Viewer click fallback failed:", error);
        }
    };

    elements.viewer.addEventListener("click", elements.viewer._hudClickListener);
}

function toggleFullscreen() {
    const fullscreenTarget = elements.appContainer || document.documentElement;

    if (!isFullscreen()) {
        if (fullscreenTarget.requestFullscreen) {
            fullscreenTarget.requestFullscreen().catch((error) => {
                console.warn("Fullscreen request failed:", error);
            });
        } else if (fullscreenTarget.webkitRequestFullscreen) {
            fullscreenTarget.webkitRequestFullscreen();
        } else if (fullscreenTarget.msRequestFullscreen) {
            fullscreenTarget.msRequestFullscreen();
        }
    } else if (document.exitFullscreen) {
        document.exitFullscreen().catch((error) => {
            console.warn("Exit fullscreen failed:", error);
        });
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
}

function onFullscreenChange() {
    const active = isFullscreen();

    elements.fullscreenButton?.setAttribute("aria-pressed", String(active));
    if (elements.fullscreenButton) {
        elements.fullscreenButton.textContent = active ? "Exit Fullscreen" : "Fullscreen";
    }

    elements.body.classList.toggle("is-fullscreen", active);

    clearHudHideTimer();

    if (active) {
        showHUD();
        scheduleHudHide();
    } else {
        showHUD();
    }
}

function handleFullscreenActivity(event) {
    if (!isFullscreen()) {
        return;
    }

    if (event?.type === "keydown" && (event.key === "f" || event.key === "F")) {
        return;
    }

    showHUD();
    scheduleHudHide();
}

async function initReader() {
    if (!window.ePub) {
        showStartupError(
            "Reader library failed to load.",
            "The EPUB renderer was not available. Refresh the page and make sure the vendor files in assets/vendor are present."
        );
        return;
    }

    if (window.location.protocol === "file:") {
        showStartupError(
            "Open the reader through a local server.",
            "Run `python -m http.server 8080` in this folder, then open http://localhost:8080 so the EPUB can load correctly."
        );
        return;
    }

    try {
        const response = await fetch(BOOK_PATH, { method: "HEAD" });
        if (!response.ok) {
            throw new Error(`EPUB fetch error: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.warn("EPUB network check failed:", error);
        showStartupError(
            "The book file could not be found.",
            `Place ${BOOK_PATH} in the project root, then refresh reader.html.`
        );
        return;
    }

    book = ePub(BOOK_PATH);
    rendition = book.renderTo("viewer", {
        width: "100%",
        height: "100vh",
        flow: "paginated",
        spread: "none",
        manager: "default",
        sandbox: "allow-same-origin allow-scripts",
    });

    book.ready.catch((error) => {
        console.error("Failed to open EPUB:", error);
        showStartupError(
            `Failed to load ${BOOK_TITLE}.`,
            `Serve the folder over HTTP and make sure ${BOOK_PATH} is readable from the project root.`
        );
    });

    book.ready
        .then(() => book.locations.generate(1200))
        .catch((error) => {
            console.warn("Could not generate locations:", error);
        });

    rendition.on("rendered", (section, view) => {
        attachIframeInteractions(view);
        attachViewerClickFallback(view);

        const tocIndex = sectionToNavIndex(section?.href);
        if (tocIndex >= 0) {
            const chapter = state.bookNav[tocIndex];
            updateLocationIndicator(`Reading: ${chapter.label}`);
        }
    });

    book.loaded.navigation
        .then((navigation) => {
            buildToc(navigation);
        })
        .catch((error) => {
            console.warn("Could not load navigation:", error);
            updateLocationIndicator(`Opened ${BOOK_TITLE}, but the table of contents could not be loaded.`);
        });

    rendition.on("relocated", (location) => {
        let percentage = 0;

        try {
            if (location?.start?.cfi) {
                safeStorageSet(STORAGE_KEYS.readerLocation, location.start.cfi);
            }

            if (book.locations?.length) {
                const progressValue = book.locations.percentageFromCfi(location.start.cfi);
                percentage = Math.round(progressValue * 100);
            }
        } catch (error) {
            console.warn("Error reading locations:", error);
        }

        updateProgressIndicator(percentage);

        const tocIndex = sectionToNavIndex(location?.start?.href);
        const chapterText = tocIndex >= 0 ? ` - ${state.bookNav[tocIndex].label}` : "";
        updateLocationIndicator(`Progress: ${percentage}%${chapterText}`);
    });

    try {
        rendition.themes.register("dark", {
            body: {
                background: "#10201E",
                color: "#F7F0EB",
            },
            a: {
                color: "#F3CDA9",
            },
        });

        rendition.themes.register("sepia", {
            body: {
                background: "#F3CDA9",
                color: "#382A26",
            },
            a: {
                color: "#7E372F",
            },
        });

        rendition.themes.register("light", {
            body: {
                background: "#F7F0EB",
                color: "#243331",
            },
            a: {
                color: "#1A5153",
            },
        });
    } catch (error) {
        console.warn("Could not register themes:", error);
    }

    if (elements.splash) {
        const splashTimer = window.setTimeout(dismissSplash, SPLASH_DURATION_MS);
        elements.splash.addEventListener(
            "click",
            () => {
                window.clearTimeout(splashTimer);
                dismissSplash();
            },
            { once: true }
        );
    } else {
        elements.body.classList.remove("splash-active");
        performInitialDisplay();
    }
}

elements.body.classList.add("splash-active");

elements.menuButton?.addEventListener("click", () => {
    if (elements.sideMenu?.classList.contains("open")) {
        closeSideMenu();
    } else {
        openSideMenu();
    }
});

elements.menuCloseButton?.addEventListener("click", closeSideMenu);
elements.fontDecreaseButton?.addEventListener("click", () => changeFontSize(-1));
elements.fontIncreaseButton?.addEventListener("click", () => changeFontSize(1));

elements.themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        const themeName = button.dataset.theme || "dark";
        setTheme(themeName);
    });
});

elements.fullscreenButton?.addEventListener("click", toggleFullscreen);

document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("webkitfullscreenchange", onFullscreenChange);
document.addEventListener("msfullscreenchange", onFullscreenChange);

document.addEventListener("mousemove", handleFullscreenActivity, { passive: true });
document.addEventListener("touchstart", handleFullscreenActivity, { passive: true });
document.addEventListener("keydown", handleFullscreenActivity);

document.addEventListener("keydown", (event) => {
    if (event.key === "f" || event.key === "F") {
        const activeElement = document.activeElement;
        const isTypingTarget =
            activeElement &&
            (activeElement.tagName === "INPUT" ||
                activeElement.tagName === "TEXTAREA" ||
                activeElement.isContentEditable);

        if (!isTypingTarget) {
            toggleFullscreen();
        }
    }

    if (event.key === "Escape" && elements.sideMenu?.classList.contains("open")) {
        closeSideMenu();
    }
});

setTheme(state.currentTheme);
updateProgressIndicator(0);
applyReaderOverrides(`${state.currentFontSize}%`);
updateFontControlState();
initReader();

window.changeFontSize = changeFontSize;
window.setTheme = setTheme;
