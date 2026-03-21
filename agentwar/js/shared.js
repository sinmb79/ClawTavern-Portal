(() => {
  const BASE_CHAIN_HEX = "0x2105";
  const AIL_ORIGIN = "https://www.agentidcard.org";
  const AIL_POPUP_URL = `${AIL_ORIGIN}/dashboard?source=agentwar`;
  const AIL_ID_PATTERN = /AIL-\d{4}-\d{5}/i;
  const STORAGE_KEYS = {
    wallet: "agentwar.wallet.address",
    legalAccepted: "agentwar.legal.accepted",
    ailRegistered: "agentwar.ail.registered",
    ailProfile: "agentwar.ail.profile",
    joinIntent: "agentwar.join.intent",
    joinSelection: "agentwar.join.selection",
  };

  let pendingLegalAction = null;

  function strings() {
    return window.AgentWarI18n?.getStrings?.() ?? {};
  }

  function shortAddress(address) {
    return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "";
  }

  function readJson(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function currentPathname() {
    return window.location.pathname.replace(/\/+$/, "") || "/";
  }

  function defaultContinueUrl() {
    const pathname = currentPathname();
    if (pathname === "/agentwar" || pathname === "/agentwar/index.html") {
      return "./factions.html";
    }
    return window.location.href;
  }

  function rememberJoinIntent(intent = {}) {
    writeJson(STORAGE_KEYS.joinIntent, {
      arena: intent.arena ?? null,
      faction: intent.faction ?? null,
      returnUrl: intent.returnUrl || defaultContinueUrl(),
      recordedAt: new Date().toISOString(),
    });
  }

  function readJoinIntent() {
    return readJson(STORAGE_KEYS.joinIntent);
  }

  function clearJoinIntent() {
    localStorage.removeItem(STORAGE_KEYS.joinIntent);
  }

  function saveJoinSelection(selection = {}) {
    writeJson(STORAGE_KEYS.joinSelection, {
      arena: selection.arena ?? null,
      faction: selection.faction ?? null,
      linkedAt: new Date().toISOString(),
    });
  }

  function getJoinSelection() {
    return readJson(STORAGE_KEYS.joinSelection);
  }

  function getAILProfile() {
    const profile = readJson(STORAGE_KEYS.ailProfile);
    return profile && profile.ailId ? profile : null;
  }

  function isAILRegistered() {
    return Boolean(getAILProfile()) || localStorage.getItem(STORAGE_KEYS.ailRegistered) === "true";
  }

  function applyWalletLabel(address) {
    const label = address ? shortAddress(address) : strings().connectWallet || "Connect Wallet";
    document.querySelectorAll(".connect-btn,[data-wallet-action]").forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      button.textContent = label;
      button.dataset.connected = address ? "true" : "false";
    });
  }

  function applyLinkedAgentState(profile = getAILProfile()) {
    document.body.dataset.agentLinked = profile ? "true" : "false";
    document.querySelectorAll("[data-agent-linked-label]").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      if (!profile) {
        element.textContent = "";
        element.hidden = true;
        return;
      }
      element.textContent = `${strings().ailLinkedBanner || "Linked Agent"}: ${profile.agentName || profile.ailId}`;
      element.hidden = false;
    });
  }

  async function ensureBase(provider) {
    if (!provider?.request) return;

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_HEX }],
    }).catch(async (error) => {
      if (error?.code !== 4902) throw error;

      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: BASE_CHAIN_HEX,
          chainName: "Base Mainnet",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"],
        }],
      });
    });
  }

  async function connectWallet() {
    if (!window.ethereum?.request) {
      window.alert(strings().walletMissing || "No browser wallet was detected.");
      return null;
    }

    await ensureBase(window.ethereum);
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const address = accounts?.[0] ?? null;

    if (address) {
      localStorage.setItem(STORAGE_KEYS.wallet, address);
      applyWalletLabel(address);
    }

    return address;
  }

  function restoreWalletLabel() {
    applyWalletLabel(localStorage.getItem(STORAGE_KEYS.wallet));
  }

  function bindWalletButtons() {
    document.querySelectorAll(".connect-btn,[data-wallet-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await connectWallet();
        } catch (error) {
          console.error("Agent War wallet connect failed", error);
          window.alert(strings().walletError || "Wallet connection failed.");
        }
      });
    });
  }

  function ensureLegalModal() {
    if (document.getElementById("agentwar-legal-modal")) return;

    const modal = document.createElement("div");
    modal.id = "agentwar-legal-modal";
    modal.className = "agentwar-modal agentwar-legal-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="agentwar-modal__backdrop"></div>
      <div class="agentwar-modal__card" role="dialog" aria-modal="true" aria-labelledby="agentwar-legal-title">
        <div class="agentwar-modal__header">
          <div>
            <div class="agentwar-legal-modal__eyebrow" id="agentwar-legal-eyebrow"></div>
            <div class="agentwar-modal__title" id="agentwar-legal-title"></div>
          </div>
        </div>
        <div class="agentwar-modal__body agentwar-legal-modal__body">
          <div class="agentwar-legal-modal__lead" id="agentwar-legal-lead"></div>
          <div class="agentwar-legal-modal__list" id="agentwar-legal-items"></div>
          <div class="agentwar-legal-modal__footnote" id="agentwar-legal-footnote"></div>
        </div>
        <div class="agentwar-modal__footer">
          <button type="button" class="agentwar-modal__button" id="agentwar-legal-exit"></button>
          <button type="button" class="agentwar-modal__button agentwar-modal__button--primary" id="agentwar-legal-accept"></button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function ensureAgentLinkModal() {
    if (document.getElementById("agentwar-link-modal")) return;

    const modal = document.createElement("div");
    modal.id = "agentwar-link-modal";
    modal.className = "agentwar-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="agentwar-modal__backdrop"></div>
      <div class="agentwar-modal__card" role="dialog" aria-modal="true" aria-labelledby="agentwar-link-title">
        <div class="agentwar-modal__header">
          <div>
            <div class="agentwar-link-modal__eyebrow">AGENT ONBOARDING</div>
            <div class="agentwar-modal__title" id="agentwar-link-title"></div>
          </div>
          <button type="button" class="agentwar-modal__close" id="agentwar-link-close">Close</button>
        </div>
        <div class="agentwar-modal__body agentwar-link-modal__body">
          <div class="agentwar-link-modal__lead" id="agentwar-link-lead"></div>
          <div class="agentwar-link-modal__hint" id="agentwar-link-hint"></div>
          <div class="agentwar-link-modal__status" id="agentwar-link-status" hidden></div>
          <div class="agentwar-link-modal__grid">
            <div class="agentwar-link-modal__panel">
              <div class="agentwar-link-modal__panel-title">1. Agent ID Card</div>
              <div class="agentwar-link-modal__panel-copy">
                Open the popup, sign in, and either register a new agent or open an existing card.
              </div>
              <div class="agentwar-link-modal__panel-actions">
                <button type="button" class="agentwar-modal__button" id="agentwar-link-open-popup"></button>
                <a class="agentwar-modal__button" id="agentwar-link-open-tab" href="${AIL_POPUP_URL}" target="_blank" rel="noreferrer noopener">Open in New Tab</a>
              </div>
            </div>
            <div class="agentwar-link-modal__panel">
              <div class="agentwar-link-modal__panel-title">2. Link to Agent War</div>
              <label class="agentwar-link-modal__field">
                <span id="agentwar-link-name-label"></span>
                <input type="text" id="agentwar-link-name" placeholder="CrystalMind">
              </label>
              <label class="agentwar-link-modal__field">
                <span id="agentwar-link-id-label"></span>
                <input type="text" id="agentwar-link-id" placeholder="AIL-2026-00042">
              </label>
              <label class="agentwar-link-modal__field">
                <span id="agentwar-link-provider-label"></span>
                <input type="text" id="agentwar-link-provider" placeholder="anthropic">
              </label>
            </div>
          </div>
        </div>
        <div class="agentwar-modal__footer">
          <button type="button" class="agentwar-modal__button" id="agentwar-link-cancel"></button>
          <button type="button" class="agentwar-modal__button" id="agentwar-link-existing"></button>
          <button type="button" class="agentwar-modal__button agentwar-modal__button--primary" id="agentwar-link-submit"></button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  }

  function syncLegalCopy() {
    const copy = strings();
    const items = document.getElementById("agentwar-legal-items");
    if (items) {
      items.innerHTML = (copy.legalItems || [])
        .map((item) => `<div class="agentwar-legal-modal__item">${item}</div>`)
        .join("");
    }

    const mappings = [
      ["agentwar-legal-title", copy.legalTitle],
      ["agentwar-legal-eyebrow", copy.legalEyebrow],
      ["agentwar-legal-lead", copy.legalLead],
      ["agentwar-legal-footnote", copy.legalFootnote],
      ["agentwar-legal-accept", copy.legalAccept],
      ["agentwar-legal-exit", copy.legalExit],
    ];

    mappings.forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && typeof value === "string") {
        element.textContent = value;
      }
    });
  }

  function syncLinkModal(profile = getAILProfile()) {
    const copy = strings();
    const mappings = [
      ["agentwar-link-title", copy.ailLinkTitle],
      ["agentwar-link-lead", copy.ailLinkLead],
      ["agentwar-link-hint", copy.ailLinkHint],
      ["agentwar-link-name-label", copy.ailLinkNameLabel],
      ["agentwar-link-id-label", copy.ailLinkIdLabel],
      ["agentwar-link-provider-label", copy.ailLinkProviderLabel],
      ["agentwar-link-submit", copy.ailLinkContinue],
      ["agentwar-link-cancel", copy.ailLinkCancel],
      ["agentwar-link-existing", copy.ailLinkExisting],
      ["agentwar-link-open-popup", copy.ailLinkOpenPopup],
      ["agentwar-link-close", "Close"],
    ];

    mappings.forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && typeof value === "string") {
        element.textContent = value;
      }
    });

    const nameInput = document.getElementById("agentwar-link-name");
    const idInput = document.getElementById("agentwar-link-id");
    const providerInput = document.getElementById("agentwar-link-provider");
    if (nameInput instanceof HTMLInputElement) nameInput.value = profile?.agentName || "";
    if (idInput instanceof HTMLInputElement) idInput.value = profile?.ailId || "";
    if (providerInput instanceof HTMLInputElement) providerInput.value = profile?.provider || "";
  }

  function setLinkModalStatus(message, tone = "neutral") {
    const status = document.getElementById("agentwar-link-status");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
    status.dataset.tone = tone;
  }

  async function showLinkModal() {
    ensureAgentLinkModal();
    syncLinkModal();
    setLinkModalStatus("", "neutral");
    const modal = document.getElementById("agentwar-link-modal");
    if (modal) modal.hidden = false;
    const clipboardAilId = await prefillAilIdFromClipboard();
    if (clipboardAilId) {
      setLinkModalStatus(
        strings().ailLinkClipboardReady || "An AIL ID was detected from your clipboard. Review it and click Link Agent ID Card to continue.",
        "success"
      );
    }
  }

  function closeLinkModal() {
    const modal = document.getElementById("agentwar-link-modal");
    if (modal) modal.hidden = true;
  }

  function openLegalModal() {
    ensureLegalModal();
    syncLegalCopy();
    const modal = document.getElementById("agentwar-legal-modal");
    if (modal) modal.hidden = false;
  }

  function closeLegalModal() {
    const modal = document.getElementById("agentwar-legal-modal");
    if (modal) modal.hidden = true;
  }

  async function prefillAilIdFromClipboard() {
    if (!navigator.clipboard?.readText) return null;

    try {
      const clipboardText = await navigator.clipboard.readText();
      const match = clipboardText.match(AIL_ID_PATTERN);
      if (!match) return null;

      const idInput = document.getElementById("agentwar-link-id");
      if (idInput instanceof HTMLInputElement && !idInput.value.trim()) {
        idInput.value = match[0].toUpperCase();
      }

      return match[0].toUpperCase();
    } catch {
      return null;
    }
  }

  function normalizeAilId(value) {
    const match = String(value || "").trim().match(AIL_ID_PATTERN);
    return match ? match[0].toUpperCase() : "";
  }

  function resolveLinkedAgentName(rawName, ailId) {
    const trimmed = String(rawName || "").trim();
    if (trimmed) return trimmed;
    return `Agent ${String(ailId || "").slice(-5) || "Pilot"}`;
  }

  function autoLinkAilId(ailId, source = "clipboard") {
    const normalizedId = normalizeAilId(ailId);
    if (!normalizedId) return null;

    const nameInput = document.getElementById("agentwar-link-name");
    const providerInput = document.getElementById("agentwar-link-provider");
    const profile = persistAILProfile({
      ailId: normalizedId,
      agentName: resolveLinkedAgentName(
        nameInput instanceof HTMLInputElement ? nameInput.value : "",
        normalizedId
      ),
      provider: providerInput instanceof HTMLInputElement ? providerInput.value.trim() : "",
      source,
    });

    if (!profile) return null;
    setLinkModalStatus(strings().ailLinkLinked || "Agent ID Card linked successfully.", "success");
    window.setTimeout(() => continueAfterAgentLink(profile), 180);
    return profile;
  }

  function promptForAilId() {
    const input = window.prompt("Paste your AIL ID to continue into Agent War.", "");
    return normalizeAilId(input || "");
  }

  function watchAilPopup(popup) {
    const poll = window.setInterval(async () => {
      if (!popup || !popup.closed) return;

      window.clearInterval(poll);
      const ailId = await prefillAilIdFromClipboard();
      if (ailId) {
        if (autoLinkAilId(ailId, "clipboard")) return;
      }

      const manualAilId = promptForAilId();
      if (manualAilId) {
        if (autoLinkAilId(manualAilId, "manual-prompt")) return;
        return;
      }

      setLinkModalStatus(
        strings().ailLinkMissingProfile || "Open Agent ID Card first, then link the AIL ID here to continue.",
        "neutral"
      );
    }, 500);
  }

  function openAILPopup() {
    const width = 560;
    const height = 820;
    const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
    const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || screen.width || width;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || screen.height || height;
    const left = Math.max(0, Math.round(dualScreenLeft + (viewportWidth - width) / 2));
    const top = Math.max(0, Math.round(dualScreenTop + (viewportHeight - height) / 2));
    const features = [
      "popup=yes",
      `width=${width}`,
      `height=${height}`,
      `left=${left}`,
      `top=${top}`,
      "resizable=yes",
      "scrollbars=yes",
    ].join(",");

    const popup = window.open(AIL_POPUP_URL, "agentwar_ail_card", features);
    if (popup) {
      popup.focus?.();
      watchAilPopup(popup);
      return popup;
    }

    window.alert(strings().popupBlocked || "The registration popup was blocked. A new tab will open instead.");
    window.open(AIL_POPUP_URL, "_blank", "noopener,noreferrer");
    return null;
  }

  function persistAILProfile(profile) {
    const ailId = String(profile?.ailId || "").trim();
    if (!ailId) return null;

    const normalized = {
      ailId,
      agentName: String(profile?.agentName || profile?.name || ailId).trim(),
      provider: String(profile?.provider || "").trim(),
      linkedAt: new Date().toISOString(),
      source: profile?.source || "manual",
    };

    writeJson(STORAGE_KEYS.ailProfile, normalized);
    localStorage.setItem(STORAGE_KEYS.ailRegistered, "true");
    applyLinkedAgentState(normalized);
    window.dispatchEvent(new CustomEvent("agentwar:ail-linked", { detail: normalized }));
    return normalized;
  }

  function continueAfterAgentLink(profile) {
    const intent = readJoinIntent();
    if (intent?.arena && intent?.faction) {
      saveJoinSelection({
        arena: intent.arena,
        faction: intent.faction,
      });
    }

    const target = intent?.arena && intent?.faction
      ? "./profile.html"
      : (intent?.returnUrl || defaultContinueUrl());
    closeLinkModal();
    clearJoinIntent();

    if (target === window.location.href) {
      window.location.href = "./profile.html";
      return;
    }

    window.location.href = target;
  }

  async function linkAgentFromForm(source) {
    const ailInput = document.getElementById("agentwar-link-id");
    const nameInput = document.getElementById("agentwar-link-name");
    const providerInput = document.getElementById("agentwar-link-provider");
    let ailId = ailInput instanceof HTMLInputElement ? ailInput.value.trim() : "";

    if (!ailId) {
      const clipboardAilId = await prefillAilIdFromClipboard();
      if (clipboardAilId) {
        ailId = clipboardAilId;
      }
    }

    if (!ailId) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID to continue.", "error");
      return;
    }

    const profile = persistAILProfile({
      ailId,
      agentName: resolveLinkedAgentName(
        nameInput instanceof HTMLInputElement ? nameInput.value.trim() : "",
        ailId
      ),
      provider: providerInput instanceof HTMLInputElement ? providerInput.value.trim() : "",
      source,
    });

    if (!profile) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID to continue.", "error");
      return;
    }

    setLinkModalStatus(strings().ailLinkLinked || "Agent ID Card linked successfully.", "success");
    window.setTimeout(() => continueAfterAgentLink(profile), 220);
  }

  function markAILRegistered(profile = {}) {
    if (profile?.ailId) {
      const saved = persistAILProfile(profile);
      if (saved) {
        continueAfterAgentLink(saved);
        return;
      }
    }

    localStorage.setItem(STORAGE_KEYS.ailRegistered, "true");
    window.alert(strings().registeredToast || "Agent ID Card registration has been marked as complete for this browser.");
  }

  function handleAgentIdMessage(event) {
    if (event.origin !== AIL_ORIGIN) return;

    const payload = event.data || {};
    const hasProfile = Boolean(payload?.ailId || payload?.profile?.ailId);
    if (payload?.type !== "agentidcard:linked" && payload?.type !== "agentidcard.linked" && !hasProfile) {
      return;
    }

    const profile = persistAILProfile({
      ailId: payload.ailId || payload.profile?.ailId,
      agentName: payload.agentName || payload.profile?.agentName || payload.profile?.name,
      provider: payload.provider || payload.profile?.provider,
      source: "postMessage",
    });

    if (!profile) return;
    continueAfterAgentLink(profile);
  }

  function runAfterLegalAcceptance(action) {
    if (localStorage.getItem(STORAGE_KEYS.legalAccepted) === "true") {
      action();
      return;
    }

    pendingLegalAction = action;
    openLegalModal();
  }

  function requestAgentJoin(options = {}) {
    runAfterLegalAcceptance(() => {
      rememberJoinIntent(options);
      const existingProfile = getAILProfile();
      if (existingProfile) {
        continueAfterAgentLink(existingProfile);
        return;
      }

      openAILPopup();
      showLinkModal();
    });
  }

  function completeJoin(selection = {}) {
    const profile = getAILProfile();
    if (!profile) {
      requestAgentJoin({
        arena: selection.arena ?? null,
        faction: selection.faction ?? null,
        returnUrl: window.location.href,
      });
      return false;
    }

    saveJoinSelection(selection);
    window.location.href = "./profile.html";
    return true;
  }

  function bindLegalModal() {
    document.getElementById("agentwar-legal-accept")?.addEventListener("click", () => {
      localStorage.setItem(STORAGE_KEYS.legalAccepted, "true");
      closeLegalModal();
      if (typeof pendingLegalAction === "function") {
        const action = pendingLegalAction;
        pendingLegalAction = null;
        action();
      }
    });

    document.getElementById("agentwar-legal-exit")?.addEventListener("click", () => {
      pendingLegalAction = null;
      window.location.href = "../index.html";
    });
  }

  function bindLinkModal() {
    document.getElementById("agentwar-link-close")?.addEventListener("click", closeLinkModal);
    document.getElementById("agentwar-link-cancel")?.addEventListener("click", closeLinkModal);
    document.getElementById("agentwar-link-open-popup")?.addEventListener("click", () => {
      openAILPopup();
      setLinkModalStatus("", "neutral");
    });
    document.getElementById("agentwar-link-existing")?.addEventListener("click", async () => {
      await linkAgentFromForm("existing-card");
    });
    document.getElementById("agentwar-link-submit")?.addEventListener("click", async () => {
      await linkAgentFromForm("registration");
    });
  }

  function bindJoinButtons() {
    document.querySelectorAll("[data-open-ail],[data-agent-join]").forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        requestAgentJoin();
      });
    });
  }

  window.addEventListener("message", handleAgentIdMessage);

  window.AgentWarShared = {
    connectWallet,
    restoreWalletLabel,
    openAILModal: showLinkModal,
    openAILPopup,
    openLegalModal,
    markAILRegistered,
    isAILRegistered,
    getAILProfile,
    getJoinSelection,
    requestAgentJoin,
    completeJoin,
    showAgentLinkModal: showLinkModal,
  };

  document.addEventListener("DOMContentLoaded", () => {
    window.AgentWarI18n?.applyPage?.();
    ensureLegalModal();
    ensureAgentLinkModal();
    syncLegalCopy();
    bindWalletButtons();
    restoreWalletLabel();
    bindLegalModal();
    bindLinkModal();
    bindJoinButtons();
    applyLinkedAgentState();
  });
})();
