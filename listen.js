const MANIFEST_PATH = "manifest.json";
const AUDIO_DIR = "audio/";
const GITHUB_MEDIA_AUDIO_BASE = "https://media.githubusercontent.com/media/KgitWH21/gates-of-okinawa-reader-app/main/audio/";
const SLEEP_TIMER_KEY = "gatesOfOkinawa.listening.sleepTimer";
const FADE_DURATION_SECONDS = 10;
const END_OF_TRACK_EPSILON = 0.35;

const STORAGE_KEYS = {
    lastTrack: "gatesOfOkinawa.listening.track",
    playbackSpeed: "gatesOfOkinawa.listening.speed",
    sleepTimer: SLEEP_TIMER_KEY,
};

const SLEEP_OPTIONS = {
    off: { label: "Off", minutes: 0 },
    15: { label: "15 minutes", minutes: 15 },
    30: { label: "30 minutes", minutes: 30 },
    45: { label: "45 minutes", minutes: 45 },
    60: { label: "60 minutes", minutes: 60 },
    chapter: { label: "End of chapter", minutes: null },
};

const state = {
    tracks: [],
    currentIndex: -1,
    pendingResumeTime: null,
    autoplayAfterLoad: false,
    playbackRate: loadStoredPlaybackRate(),
    currentSourceAvailable: false,
    sleepTimer: {
        activeOption: "off",
        lastPreference: loadStoredSleepTimerPreference(),
        remainingSeconds: 0,
        intervalId: null,
        lastTick: null,
        preFadeVolume: null,
    },
};

const elements = {
    audio: document.getElementById("chapter-audio"),
    chapterList: document.getElementById("audio-chapter-list"),
    currentChapterTitle: document.getElementById("current-chapter-title"),
    chapterHint: document.getElementById("chapter-hint"),
    status: document.getElementById("audio-status"),
    chapterCount: document.getElementById("chapter-count"),
    prevButton: document.getElementById("prev-track-btn"),
    nextButton: document.getElementById("next-track-btn"),
    playPauseButton: document.getElementById("play-pause-btn"),
    skipBackwardButton: document.getElementById("skip-backward-btn"),
    skipForwardButton: document.getElementById("skip-forward-btn"),
    seekBar: document.getElementById("seek-bar"),
    currentTime: document.getElementById("current-time"),
    totalTime: document.getElementById("total-time"),
    speedSelect: document.getElementById("speed-select"),
    sleepTimerButton: document.getElementById("sleep-timer-btn"),
    sleepTimerLabel: document.getElementById("sleep-timer-label"),
    sleepTimerMenu: document.getElementById("sleep-timer-menu"),
    sleepTimerOptions: Array.from(document.querySelectorAll("[data-sleep-option]")),
};

function safeStorageGet(key) {
    try {
        return window.localStorage.getItem(key);
    } catch (error) {
        return null;
    }
}

function safeStorageSet(key, value) {
    try {
        window.localStorage.setItem(key, value);
    } catch (error) {
        setStatus("Progress could not be saved in this browser session.", true);
    }
}

function getPositionKey(fileName) {
    return `gatesOfOkinawa.listening.timestamp.${fileName}`;
}

function loadStoredPlaybackRate() {
    const parsedValue = Number(safeStorageGet(STORAGE_KEYS.playbackSpeed));
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 1;
}

function loadStoredSleepTimerPreference() {
    const stored = safeStorageGet(STORAGE_KEYS.sleepTimer);
    return SLEEP_OPTIONS[stored] ? stored : "off";
}

function loadSavedPosition(fileName) {
    const parsedValue = Number(safeStorageGet(getPositionKey(fileName)));
    return Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
}

function saveCurrentPosition() {
    const track = state.tracks[state.currentIndex];
    if (!track || !elements.audio || !Number.isFinite(elements.audio.currentTime)) {
        return;
    }

    safeStorageSet(getPositionKey(track.file), String(Math.floor(elements.audio.currentTime)));
}

function setStatus(message, isError = false) {
    if (!elements.status) {
        return;
    }

    elements.status.textContent = message;
    elements.status.classList.toggle("error", isError);
}

function resolveTrackPath(fileName) {
    if (!fileName) {
        return "";
    }

    if (/^(https?:)?\/\//.test(fileName) || fileName.startsWith("./") || fileName.startsWith("../") || fileName.startsWith("/")) {
        return fileName;
    }

    return `${AUDIO_DIR}${fileName}`;
}

async function checkAudioAvailability(filePath) {
    if (!filePath) {
        return null;
    }

    try {
        const response = await fetch(filePath, { method: "HEAD" });
        return response;
    } catch (error) {
        return null;
    }
}

function isLikelyLfsPointerResponse(response) {
    if (!response?.ok) {
        return false;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const contentLength = Number(response.headers.get("content-length") || "0");

    return (
        contentType.includes("text/plain") ||
        (Number.isFinite(contentLength) && contentLength > 0 && contentLength < 1024)
    );
}

function buildGitHubMediaPath(fileName) {
    return `${GITHUB_MEDIA_AUDIO_BASE}${String(fileName)
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/")}`;
}

async function resolvePlayableTrackPath(track) {
    if (!track?.file) {
        return "";
    }

    if (track.url) {
        return track.url;
    }

    const localPath = resolveTrackPath(track.file);
    const localResponse = await checkAudioAvailability(localPath);
    if (localResponse?.ok && !isLikelyLfsPointerResponse(localResponse)) {
        return localPath;
    }

    const mediaPath = buildGitHubMediaPath(track.file);
    const mediaResponse = await checkAudioAvailability(mediaPath);
    if (mediaResponse?.ok && !isLikelyLfsPointerResponse(mediaResponse)) {
        return mediaPath;
    }

    return "";
}

async function readManifestFile() {
    const response = await fetch(MANIFEST_PATH);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder("utf-16le").decode(buffer.slice(2));
    }

    return new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, "");
}

function formatTrackCount(count) {
    return `${count} ${count === 1 ? "track" : "tracks"}`;
}

function formatTime(valueInSeconds) {
    if (!Number.isFinite(valueInSeconds) || valueInSeconds < 0) {
        return "0:00";
    }

    const totalSeconds = Math.floor(valueInSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatSleepRemaining(seconds) {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds % 60;
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function updateTimeDisplay() {
    if (!elements.audio) {
        return;
    }

    const currentTime = Number.isFinite(elements.audio.currentTime) ? elements.audio.currentTime : 0;
    const duration = Number.isFinite(elements.audio.duration) ? elements.audio.duration : 0;

    if (elements.currentTime) {
        elements.currentTime.textContent = formatTime(currentTime);
    }

    if (elements.totalTime) {
        elements.totalTime.textContent = formatTime(duration);
    }

    if (elements.seekBar) {
        elements.seekBar.max = String(Math.max(0, Math.floor(duration)));
        elements.seekBar.value = String(Math.min(Math.floor(currentTime), Math.floor(duration || 0)));
    }
}

function updatePlayPauseButton() {
    if (!elements.playPauseButton || !elements.audio) {
        return;
    }

    elements.playPauseButton.textContent = elements.audio.paused ? "Play" : "Pause";
}

function updateNavigationState() {
    const hasTracks = state.tracks.length > 0;
    const hasSelection = hasTracks && state.currentIndex >= 0;
    const isFirst = state.currentIndex <= 0;
    const isLast = state.currentIndex >= state.tracks.length - 1;
    const canControlTrack = hasSelection && state.currentSourceAvailable;

    if (elements.prevButton) {
        elements.prevButton.disabled = !hasTracks || isFirst;
    }

    if (elements.nextButton) {
        elements.nextButton.disabled = !hasTracks || isLast;
    }

    if (elements.playPauseButton) {
        elements.playPauseButton.disabled = !canControlTrack;
    }

    if (elements.skipBackwardButton) {
        elements.skipBackwardButton.disabled = !canControlTrack;
    }

    if (elements.skipForwardButton) {
        elements.skipForwardButton.disabled = !canControlTrack;
    }

    if (elements.seekBar) {
        elements.seekBar.disabled = !canControlTrack;
    }
}

function getTrackStateLabel(track, index) {
    if (index === state.currentIndex) {
        const savedPosition = loadSavedPosition(track.file);
        return savedPosition > 0 ? `Resume ${formatTime(savedPosition)}` : "Selected";
    }

    const savedPosition = loadSavedPosition(track.file);
    return savedPosition > 0 ? formatTime(savedPosition) : "Load";
}

function renderTrackList() {
    if (!elements.chapterList) {
        return;
    }

    elements.chapterList.innerHTML = "";

    state.tracks.forEach((track, index) => {
        const listItem = document.createElement("li");
        const button = document.createElement("button");
        const metaWrap = document.createElement("span");
        const indexLabel = document.createElement("span");
        const titleLabel = document.createElement("span");
        const stateLabel = document.createElement("span");
        const labelText = track.chapterLabel || `Chapter ${String(index + 1).padStart(2, "0")}`;

        button.type = "button";
        button.className = "chapter-button";
        if (index === state.currentIndex) {
            button.classList.add("active");
        }

        metaWrap.className = "chapter-meta";
        indexLabel.className = "chapter-index";
        titleLabel.className = "chapter-title";
        stateLabel.className = "chapter-state";

        indexLabel.textContent = labelText;
        titleLabel.textContent = track.title;
        stateLabel.textContent = getTrackStateLabel(track, index);

        metaWrap.appendChild(indexLabel);
        metaWrap.appendChild(titleLabel);
        button.appendChild(metaWrap);
        button.appendChild(stateLabel);

        button.addEventListener("click", () => {
            selectTrack(index);
        });

        listItem.appendChild(button);
        elements.chapterList.appendChild(listItem);
    });

    if (elements.chapterCount) {
        elements.chapterCount.textContent = formatTrackCount(state.tracks.length);
    }

    updateNavigationState();
}

function updateTrackDetails(track) {
    if (elements.currentChapterTitle) {
        elements.currentChapterTitle.textContent = track ? track.title : "No track selected";
    }

    if (elements.chapterHint) {
        if (!track) {
            elements.chapterHint.textContent = "Choose a chapter to begin listening.";
        } else if (track.chapterLabel) {
            elements.chapterHint.textContent = track.chapterLabel;
        } else {
            elements.chapterHint.textContent = `Track ${String(state.currentIndex + 1).padStart(2, "0")} of ${state.tracks.length}`;
        }
    }
}

async function selectTrack(index, options = {}) {
    const { autoplay = false } = options;

    if (index < 0 || index >= state.tracks.length || !elements.audio) {
        return;
    }

    const track = state.tracks[index];
    const sameTrackSelected = state.currentIndex === index && elements.audio.dataset.file === track.file;

    saveCurrentPosition();
    resetSleepFade();
    state.currentIndex = index;
    state.pendingResumeTime = loadSavedPosition(track.file);
    state.autoplayAfterLoad = autoplay;
    state.currentSourceAvailable = false;

    safeStorageSet(STORAGE_KEYS.lastTrack, track.file);
    updateTrackDetails(track);
    renderTrackList();

    if (sameTrackSelected && elements.audio.src) {
        state.currentSourceAvailable = true;
        updateNavigationState();
        setStatus(`Ready to continue ${track.title}.`);

        if (autoplay) {
            safePlay(track.title);
        }

        return;
    }

    setStatus(`Loading ${track.title}...`);

    const nextSource = await resolvePlayableTrackPath(track);
    if (!nextSource) {
        elements.audio.removeAttribute("src");
        elements.audio.dataset.file = "";
        elements.audio.load();
        setStatus(`Audio not found: ${track.file}. Check the audio upload or manifest.json.`, true);
        updateTimeDisplay();
        updatePlayPauseButton();
        updateNavigationState();
        return;
    }

    state.currentSourceAvailable = true;
    elements.audio.src = nextSource;
    elements.audio.dataset.file = track.file;
    elements.audio.playbackRate = state.playbackRate;
    elements.audio.load();
    updateTimeDisplay();
    updatePlayPauseButton();
    updateNavigationState();
}

function restorePendingPosition() {
    if (!elements.audio) {
        return;
    }

    const duration = Number.isFinite(elements.audio.duration) ? elements.audio.duration : 0;
    const resumeTime = state.pendingResumeTime ?? 0;
    state.pendingResumeTime = null;

    if (resumeTime > 0 && duration > 0) {
        try {
            elements.audio.currentTime = Math.min(resumeTime, Math.max(0, duration - 1));
        } catch (error) {
            setStatus("Saved listening position could not be restored.", true);
        }
    }

    updateTimeDisplay();
    updatePlayPauseButton();

    const track = state.tracks[state.currentIndex];
    if (!track) {
        return;
    }

    if (state.autoplayAfterLoad) {
        safePlay(track.title);
        return;
    }

    if (resumeTime > 0) {
        setStatus(`Ready to resume ${track.title} at ${formatTime(elements.audio.currentTime)}.`);
    } else {
        setStatus(`Loaded ${track.title}. Press Play when you're ready.`);
    }
}

function safePlay(trackTitle) {
    if (!elements.audio || !state.currentSourceAvailable) {
        return;
    }

    elements.audio.play()
        .then(() => {
            setStatus(`Playing ${trackTitle}.`);
            updatePlayPauseButton();
        })
        .catch((error) => {
            if (error?.name === "NotAllowedError") {
                setStatus(`Loaded ${trackTitle}. Tap Play to begin listening.`);
                updatePlayPauseButton();
                return;
            }

            setStatus(`This browser could not play ${trackTitle}. Try reloading the page.`, true);
            updatePlayPauseButton();
        });
}

function moveTrack(direction, options = {}) {
    const nextIndex = state.currentIndex + direction;
    if (nextIndex < 0 || nextIndex >= state.tracks.length) {
        return;
    }

    const shouldAutoplay = options.autoplay || (!elements.audio?.paused);
    selectTrack(nextIndex, { autoplay: shouldAutoplay });
}

function togglePlayback() {
    if (!elements.audio) {
        return;
    }

    if (state.currentIndex < 0 && state.tracks.length > 0) {
        selectTrack(0, { autoplay: true });
        return;
    }

    if (elements.audio.paused) {
        const track = state.tracks[state.currentIndex];
        safePlay(track?.title || "the selected chapter");
    } else {
        elements.audio.pause();
        saveCurrentPosition();
        setStatus("Playback paused.");
        updatePlayPauseButton();
    }
}

function skipBy(seconds) {
    if (!elements.audio || !state.currentSourceAvailable) {
        return;
    }

    const duration = Number.isFinite(elements.audio.duration) ? elements.audio.duration : 0;
    const nextTime = Math.max(0, Math.min(elements.audio.currentTime + seconds, duration || elements.audio.currentTime + seconds));
    elements.audio.currentTime = nextTime;
    updateTimeDisplay();
    saveCurrentPosition();
}

function handleSeekInput() {
    if (!elements.audio || !elements.seekBar || !state.currentSourceAvailable) {
        return;
    }

    const nextTime = Number(elements.seekBar.value);
    if (!Number.isFinite(nextTime)) {
        return;
    }

    try {
        elements.audio.currentTime = nextTime;
    } catch (error) {
        setStatus("Seek failed for this track.", true);
    }

    updateTimeDisplay();
    saveCurrentPosition();
    updateEndOfChapterTimer();
}

function persistPlaybackRate(rate) {
    state.playbackRate = rate;
    safeStorageSet(STORAGE_KEYS.playbackSpeed, String(rate));

    if (elements.audio) {
        elements.audio.playbackRate = rate;
    }
}

function resetSleepFade() {
    if (state.sleepTimer.preFadeVolume !== null && elements.audio) {
        elements.audio.volume = state.sleepTimer.preFadeVolume;
    }

    state.sleepTimer.preFadeVolume = null;
}

function applySleepFade(remainingSeconds) {
    if (!elements.audio) {
        return;
    }

    if (remainingSeconds > FADE_DURATION_SECONDS) {
        resetSleepFade();
        return;
    }

    if (state.sleepTimer.preFadeVolume === null) {
        state.sleepTimer.preFadeVolume = elements.audio.volume;
    }

    const ratio = Math.max(0, Math.min(1, remainingSeconds / FADE_DURATION_SECONDS));
    elements.audio.volume = state.sleepTimer.preFadeVolume * ratio;
}

function clearFixedSleepInterval() {
    if (state.sleepTimer.intervalId) {
        window.clearInterval(state.sleepTimer.intervalId);
        state.sleepTimer.intervalId = null;
    }

    state.sleepTimer.lastTick = null;
}

function cancelSleepTimer(options = {}) {
    const { persist = false, restoreVolume = true } = options;

    clearFixedSleepInterval();
    state.sleepTimer.activeOption = "off";
    state.sleepTimer.remainingSeconds = 0;

    if (restoreVolume) {
        resetSleepFade();
    } else {
        state.sleepTimer.preFadeVolume = null;
    }

    if (persist) {
        state.sleepTimer.lastPreference = "off";
        safeStorageSet(STORAGE_KEYS.sleepTimer, "off");
    }

    updateSleepTimerControl();
}

function fireSleepTimer(message = "Sleep timer ended. Playback paused.") {
    if (elements.audio && !elements.audio.paused) {
        elements.audio.pause();
    }

    saveCurrentPosition();
    cancelSleepTimer({ restoreVolume: true });
    setStatus(message);
    updatePlayPauseButton();
}

function tickFixedSleepTimer() {
    if (state.sleepTimer.activeOption === "off" || state.sleepTimer.activeOption === "chapter") {
        return;
    }

    if (!elements.audio || elements.audio.paused) {
        state.sleepTimer.lastTick = null;
        updateSleepTimerControl();
        return;
    }

    const now = window.performance.now();
    if (state.sleepTimer.lastTick === null) {
        state.sleepTimer.lastTick = now;
        updateSleepTimerControl();
        return;
    }

    const elapsedSeconds = (now - state.sleepTimer.lastTick) / 1000;
    state.sleepTimer.lastTick = now;
    state.sleepTimer.remainingSeconds = Math.max(0, state.sleepTimer.remainingSeconds - elapsedSeconds);

    applySleepFade(state.sleepTimer.remainingSeconds);
    updateSleepTimerControl();

    if (state.sleepTimer.remainingSeconds <= 0) {
        fireSleepTimer();
    }
}

function armFixedSleepTimer(option) {
    const config = SLEEP_OPTIONS[option];
    if (!config?.minutes) {
        return;
    }

    state.sleepTimer.activeOption = option;
    state.sleepTimer.remainingSeconds = config.minutes * 60;
    state.sleepTimer.lastTick = null;
    state.sleepTimer.intervalId = window.setInterval(tickFixedSleepTimer, 250);
    tickFixedSleepTimer();
}

function armEndOfChapterTimer() {
    state.sleepTimer.activeOption = "chapter";
    state.sleepTimer.remainingSeconds = 0;
    updateEndOfChapterTimer();
}

function setSleepTimerOption(option) {
    const normalizedOption = SLEEP_OPTIONS[option] ? option : "off";

    cancelSleepTimer({ restoreVolume: true });
    state.sleepTimer.lastPreference = normalizedOption;
    safeStorageSet(STORAGE_KEYS.sleepTimer, normalizedOption);

    if (normalizedOption === "off") {
        setStatus("Sleep timer off.");
    } else if (normalizedOption === "chapter") {
        armEndOfChapterTimer();
        setStatus("Sleep timer set for the end of this chapter.");
    } else {
        armFixedSleepTimer(normalizedOption);
        setStatus(`Sleep timer set for ${SLEEP_OPTIONS[normalizedOption].label}.`);
    }

    closeSleepTimerMenu();
    updateSleepTimerControl();
}

function updateEndOfChapterTimer() {
    if (state.sleepTimer.activeOption !== "chapter" || !elements.audio || elements.audio.paused) {
        updateSleepTimerControl();
        return;
    }

    const duration = Number.isFinite(elements.audio.duration) ? elements.audio.duration : 0;
    if (duration <= 0) {
        updateSleepTimerControl();
        return;
    }

    const remainingSeconds = Math.max(0, duration - elements.audio.currentTime);
    applySleepFade(remainingSeconds);

    if (remainingSeconds <= END_OF_TRACK_EPSILON) {
        fireSleepTimer("End of chapter reached. Playback paused.");
    }
}

function updateSleepTimerControl() {
    if (elements.sleepTimerLabel) {
        if (state.sleepTimer.activeOption === "chapter") {
            elements.sleepTimerLabel.textContent = "End of chapter";
        } else if (state.sleepTimer.activeOption !== "off") {
            elements.sleepTimerLabel.textContent = formatSleepRemaining(state.sleepTimer.remainingSeconds);
        } else {
            elements.sleepTimerLabel.textContent = "Sleep timer";
        }
    }

    elements.sleepTimerOptions.forEach((button) => {
        const option = button.dataset.sleepOption || "off";
        const isSelected = option === state.sleepTimer.lastPreference;
        button.classList.toggle("is-selected", isSelected);
        button.setAttribute("aria-checked", String(isSelected));
    });
}

function openSleepTimerMenu() {
    if (!elements.sleepTimerMenu || !elements.sleepTimerButton) {
        return;
    }

    elements.sleepTimerMenu.hidden = false;
    elements.sleepTimerButton.setAttribute("aria-expanded", "true");
}

function closeSleepTimerMenu() {
    if (!elements.sleepTimerMenu || !elements.sleepTimerButton) {
        return;
    }

    elements.sleepTimerMenu.hidden = true;
    elements.sleepTimerButton.setAttribute("aria-expanded", "false");
}

function toggleSleepTimerMenu() {
    if (elements.sleepTimerMenu?.hidden) {
        openSleepTimerMenu();
    } else {
        closeSleepTimerMenu();
    }
}

async function loadManifest() {
    try {
        const manifestText = await readManifestFile();
        const parsed = JSON.parse(manifestText);
        if (!Array.isArray(parsed)) {
            throw new Error("Manifest must be an array.");
        }

        state.tracks = parsed.filter((item) => item && item.title && item.file);
        renderTrackList();

        if (state.tracks.length === 0) {
            updateTrackDetails(null);
            setStatus("No audiobook tracks were found in manifest.json.", true);
            return;
        }

        const lastTrack = safeStorageGet(STORAGE_KEYS.lastTrack);
        const initialIndex = Math.max(
            0,
            state.tracks.findIndex((track) => track.file === lastTrack)
        );

        await selectTrack(initialIndex);
    } catch (error) {
        updateTrackDetails(null);
        setStatus("Could not load manifest.json. Check the file structure and serve over HTTP.", true);
    }
}

elements.prevButton?.addEventListener("click", () => moveTrack(-1));
elements.nextButton?.addEventListener("click", () => moveTrack(1));
elements.playPauseButton?.addEventListener("click", togglePlayback);
elements.skipBackwardButton?.addEventListener("click", () => skipBy(-15));
elements.skipForwardButton?.addEventListener("click", () => skipBy(30));
elements.seekBar?.addEventListener("input", handleSeekInput);
elements.speedSelect?.addEventListener("change", (event) => {
    const nextRate = Number(event.target.value);
    if (Number.isFinite(nextRate) && nextRate > 0) {
        persistPlaybackRate(nextRate);
    }
});

elements.sleepTimerButton?.addEventListener("click", toggleSleepTimerMenu);
elements.sleepTimerOptions.forEach((button) => {
    button.addEventListener("click", () => {
        setSleepTimerOption(button.dataset.sleepOption || "off");
    });
});

document.addEventListener("click", (event) => {
    if (
        elements.sleepTimerMenu &&
        elements.sleepTimerButton &&
        !elements.sleepTimerMenu.hidden &&
        !elements.sleepTimerMenu.contains(event.target) &&
        !elements.sleepTimerButton.contains(event.target)
    ) {
        closeSleepTimerMenu();
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeSleepTimerMenu();
    }
});

elements.audio?.addEventListener("loadedmetadata", restorePendingPosition);
elements.audio?.addEventListener("durationchange", updateTimeDisplay);
elements.audio?.addEventListener("timeupdate", () => {
    updateTimeDisplay();
    saveCurrentPosition();
    updateEndOfChapterTimer();
});
elements.audio?.addEventListener("play", () => {
    updatePlayPauseButton();
    updateEndOfChapterTimer();
});
elements.audio?.addEventListener("pause", () => {
    updatePlayPauseButton();
});
elements.audio?.addEventListener("ratechange", () => {
    if (elements.speedSelect && elements.audio) {
        elements.speedSelect.value = String(elements.audio.playbackRate);
    }
});
elements.audio?.addEventListener("error", () => {
    const track = state.tracks[state.currentIndex];
    state.currentSourceAvailable = false;
    setStatus(`Unable to play ${track?.file || "the selected audio file"}. Verify the file exists in /audio or update manifest.json.`, true);
    updateNavigationState();
    updatePlayPauseButton();
});
elements.audio?.addEventListener("ended", () => {
    saveCurrentPosition();

    if (state.sleepTimer.activeOption === "chapter") {
        fireSleepTimer("End of chapter reached. Playback paused.");
        return;
    }

    if (state.currentIndex < state.tracks.length - 1) {
        moveTrack(1, { autoplay: true });
    } else {
        setStatus("Audiobook complete. No next track available.");
        updatePlayPauseButton();
    }
});

if (elements.speedSelect) {
    elements.speedSelect.value = String(state.playbackRate);
}

if (elements.audio) {
    elements.audio.playbackRate = state.playbackRate;
}

updateNavigationState();
updateTimeDisplay();
updatePlayPauseButton();
updateSleepTimerControl();
loadManifest();
