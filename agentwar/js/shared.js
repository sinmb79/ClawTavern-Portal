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
      syncLinkModal(getAILProfile());
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
      <div class="agentwar-modal__card agentwar-link-modal__card" role="dialog" aria-modal="true" aria-labelledby="agentwar-link-title">
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
          <div class="agentwar-wizard__steps">
            <div class="agentwar-wizard__step" id="agentwar-step-card">
              <span class="agentwar-wizard__step-number">1</span>
              <span class="agentwar-wizard__step-label" id="agentwar-link-step-one"></span>
            </div>
            <div class="agentwar-wizard__step" id="agentwar-step-wallet">
              <span class="agentwar-wizard__step-number">2</span>
              <span class="agentwar-wizard__step-label" id="agentwar-link-step-two"></span>
            </div>
            <div class="agentwar-wizard__step" id="agentwar-step-register">
              <span class="agentwar-wizard__step-number">3</span>
              <span class="agentwar-wizard__step-label" id="agentwar-link-step-three"></span>
            </div>
          </div>
          <div class="agentwar-link-modal__stack">
            <section class="agentwar-link-modal__panel agentwar-link-modal__panel--card">
              <div class="agentwar-link-modal__panel-header">
                <div class="agentwar-link-modal__panel-index">01</div>
                <div>
                  <div class="agentwar-link-modal__panel-title" id="agentwar-link-card-title"></div>
                  <div class="agentwar-link-modal__panel-copy" id="agentwar-link-card-copy"></div>
                </div>
              </div>
              <label class="agentwar-link-modal__field">
                <span id="agentwar-link-token-label"></span>
                <textarea id="agentwar-link-token" rows="4" placeholder="AIL-2026-00001 or eyJhbGciOi..."></textarea>
              </label>
              <div class="agentwar-link-modal__field-note" id="agentwar-link-token-hint"></div>
              <div class="agentwar-link-modal__panel-actions">
                <button type="button" class="agentwar-modal__button agentwar-modal__button--primary" id="agentwar-link-verify"></button>
                <button type="button" class="agentwar-modal__button" id="agentwar-link-open-popup"></button>
                <a class="agentwar-modal__button" id="agentwar-link-open-tab" href="${AIL_POPUP_URL}" target="_blank" rel="noreferrer noopener"></a>
                <button type="button" class="agentwar-modal__button" id="agentwar-link-use-saved"></button>
              </div>
              <div class="agentwar-link-modal__identity" id="agentwar-link-identity" hidden>
                <div class="agentwar-link-modal__identity-label">${strings().ailLinkedBanner || "Linked Agent"}</div>
                <div class="agentwar-link-modal__identity-name" id="agentwar-link-identity-name"></div>
                <div class="agentwar-link-modal__identity-meta" id="agentwar-link-identity-meta"></div>
              </div>
            </section>
            <section class="agentwar-link-modal__panel">
              <div class="agentwar-link-modal__panel-header">
                <div class="agentwar-link-modal__panel-index">02</div>
                <div>
                  <div class="agentwar-link-modal__panel-title" id="agentwar-link-wallet-title"></div>
                  <div class="agentwar-link-modal__panel-copy" id="agentwar-link-wallet-copy"></div>
                </div>
              </div>
              <div class="agentwar-link-modal__wallet-row">
                <div class="agentwar-link-modal__wallet-chip" id="agentwar-link-wallet-state"></div>
                <button type="button" class="agentwar-modal__button" id="agentwar-link-connect-wallet"></button>
              </div>
            </section>
            <section class="agentwar-link-modal__panel">
              <div class="agentwar-link-modal__panel-header">
                <div class="agentwar-link-modal__panel-index">03</div>
                <div>
                  <div class="agentwar-link-modal__panel-title" id="agentwar-link-register-title"></div>
                  <div class="agentwar-link-modal__panel-copy" id="agentwar-link-register-copy"></div>
                </div>
              </div>
              <div class="agentwar-link-modal__summary" id="agentwar-link-summary"></div>
            </section>
          </div>
        </div>
        <div class="agentwar-modal__footer">
          <button type="button" class="agentwar-modal__button" id="agentwar-link-cancel"></button>
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
      ["agentwar-link-step-one", copy.ailLinkStepOne],
      ["agentwar-link-step-two", copy.ailLinkStepTwo],
      ["agentwar-link-step-three", copy.ailLinkStepThree],
      ["agentwar-link-card-title", copy.ailLinkCardTitle],
      ["agentwar-link-card-copy", copy.ailLinkCardCopy],
      ["agentwar-link-token-label", copy.ailLinkTokenLabel],
      ["agentwar-link-token-hint", copy.ailLinkTokenHint],
      ["agentwar-link-wallet-title", copy.ailLinkWalletTitle],
      ["agentwar-link-wallet-copy", copy.ailLinkWalletCopy],
      ["agentwar-link-register-title", copy.ailLinkRegisterTitle],
      ["agentwar-link-register-copy", copy.ailLinkRegisterCopy],
      ["agentwar-link-verify", copy.ailLinkVerify],
      ["agentwar-link-connect-wallet", copy.ailLinkWalletButton],
      ["agentwar-link-submit", copy.ailLinkContinue],
      ["agentwar-link-cancel", copy.ailLinkCancel],
      ["agentwar-link-use-saved", copy.ailLinkUseSaved],
      ["agentwar-link-open-popup", copy.ailLinkOpenPopup],
      ["agentwar-link-open-tab", copy.ailLinkOpenTab],
      ["agentwar-link-close", copy.ailLinkClose || "Close"],
    ];

    mappings.forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && typeof value === "string") {
        element.textContent = value;
      }
    });

    const tokenInput = document.getElementById("agentwar-link-token");
    if (tokenInput instanceof HTMLTextAreaElement && profile?.ailId && !tokenInput.value.trim()) {
      tokenInput.value = profile.ailId;
    }

    const identity = document.getElementById("agentwar-link-identity");
    const identityName = document.getElementById("agentwar-link-identity-name");
    const identityMeta = document.getElementById("agentwar-link-identity-meta");
    if (identity instanceof HTMLElement && identityName instanceof HTMLElement && identityMeta instanceof HTMLElement) {
      if (profile?.ailId) {
        identity.hidden = false;
        identityName.textContent = profile.agentName || profile.ailId;
        const metaParts = [profile.ailId];
        if (profile.provider) metaParts.push(profile.provider);
        identityMeta.textContent = metaParts.join(" · ");
      } else {
        identity.hidden = true;
        identityName.textContent = "";
        identityMeta.textContent = "";
      }
    }

    const savedWallet = localStorage.getItem(STORAGE_KEYS.wallet);
    const walletState = document.getElementById("agentwar-link-wallet-state");
    if (walletState instanceof HTMLElement) {
      walletState.textContent = savedWallet
        ? `${copy.ailLinkWalletConnected || "Connected wallet"}: ${shortAddress(savedWallet)}`
        : (copy.connectWallet || "Connect Wallet");
      walletState.dataset.connected = savedWallet ? "true" : "false";
    }

    const summary = document.getElementById("agentwar-link-summary");
    if (summary instanceof HTMLElement) {
      let message = copy.ailRegisterSummaryIdle || "Finish all three steps to continue.";
      if (profile?.ailId && savedWallet) {
        message = copy.ailRegisterSummaryReady || "Everything is ready. Enter Agent War.";
      } else if (profile?.ailId) {
        message = copy.ailRegisterSummaryCardOnly || "Agent ID Card verified. Wallet connection is still required.";
      } else if (savedWallet) {
        message = copy.ailRegisterSummaryWalletOnly || "Wallet connected. Verify an Agent ID Card to continue.";
      }
      summary.textContent = message;
    }

    const submitButton = document.getElementById("agentwar-link-submit");
    if (submitButton instanceof HTMLButtonElement) {
      submitButton.disabled = !(profile?.ailId && savedWallet);
    }

    const useSavedButton = document.getElementById("agentwar-link-use-saved");
    if (useSavedButton instanceof HTMLButtonElement) {
      useSavedButton.hidden = false;
    }

    const steps = [
      ["agentwar-step-card", Boolean(profile?.ailId)],
      ["agentwar-step-wallet", Boolean(savedWallet)],
      ["agentwar-step-register", Boolean(profile?.ailId && savedWallet)],
    ];
    steps.forEach(([id, complete]) => {
      const element = document.getElementById(id);
      if (element instanceof HTMLElement) {
        element.dataset.complete = complete ? "true" : "false";
      }
    });
  }

  function setLinkModalStatus(message, tone = "neutral") {
    const status = document.getElementById("agentwar-link-status");
    if (!status) return;
    status.hidden = !message;
    status.textContent = message || "";
    status.dataset.tone = tone;
  }

  function focusLinkTokenInput() {
    const tokenInput = document.getElementById("agentwar-link-token");
    if (tokenInput instanceof HTMLTextAreaElement) {
      tokenInput.focus();
      tokenInput.select();
    }
  }

  function focusWalletButton() {
    const walletButton = document.getElementById("agentwar-link-connect-wallet");
    if (walletButton instanceof HTMLButtonElement) {
      walletButton.focus();
    }
  }

  async function promoteAgentLink(profile, message) {
    if (!profile?.ailId) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID or JWT to continue.", "error");
      return;
    }

    syncLinkModal(profile);
    setLinkModalStatus(
      message || strings().ailLinkWalletReady || "Agent ID Card verified. Connect your wallet to continue.",
      "success"
    );
    const savedWallet = localStorage.getItem(STORAGE_KEYS.wallet);
    if (savedWallet) {
      setLinkModalStatus(
        strings().ailRegisterSummaryReady || "Everything is ready. Enter Agent War.",
        "success"
      );
      return;
    }

    focusWalletButton();
  }

  async function showLinkModal() {
    ensureAgentLinkModal();
    const existingProfile = getAILProfile();
    syncLinkModal(existingProfile);
    setLinkModalStatus("", "neutral");
    const modal = document.getElementById("agentwar-link-modal");
    if (modal) modal.hidden = false;
    const clipboardCard = await readClipboardCardCredential();
    if (clipboardCard?.profile) {
      setLinkModalStatus(
        strings().ailLinkClipboardReady || "An existing Agent ID Card was detected from your clipboard. Review it and verify to continue.",
        "success"
      );
    } else if (existingProfile && localStorage.getItem(STORAGE_KEYS.wallet)) {
      setLinkModalStatus(strings().ailRegisterSummaryReady || "Everything is ready. Enter Agent War.", "success");
    } else if (existingProfile) {
      setLinkModalStatus(strings().ailLinkSavedReady || "A locally linked Agent ID Card was found for this browser.", "success");
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

  async function readClipboardCardCredential() {
    if (!navigator.clipboard?.readText) return null;

    try {
      const clipboardText = await navigator.clipboard.readText();
      const raw = String(clipboardText || "").trim();
      if (!raw) return null;
      const extractedProfile = profileFromToken(raw, "clipboard");
      if (!extractedProfile) return null;

      const tokenInput = document.getElementById("agentwar-link-token");
      if (tokenInput instanceof HTMLTextAreaElement && !tokenInput.value.trim()) {
        tokenInput.value = raw;
      }

      return {
        raw,
        profile: extractedProfile,
      };
    } catch {
      return null;
    }
  }

  function normalizeAilId(value) {
    const match = String(value || "").trim().match(AIL_ID_PATTERN);
    return match ? match[0].toUpperCase() : "";
  }

  function decodeJwtPayload(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw || raw.split(".").length < 2) return null;

    try {
      const payloadSegment = raw.split(".")[1];
      const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  function profileFromToken(rawValue, source = "manual") {
    const raw = String(rawValue || "").trim();
    if (!raw) return null;

    const directAilId = normalizeAilId(raw);
    if (directAilId) {
      return {
        ailId: directAilId,
        agentName: resolveLinkedAgentName("", directAilId),
        provider: "",
        source,
      };
    }

    const payload = decodeJwtPayload(raw);
    if (!payload) return null;

    const derivedAilId = normalizeAilId(
      payload.ailId || payload.ail_id || payload.agentId || payload.agent_id || payload.sub || payload.id
    );
    if (!derivedAilId) return null;

    return {
      ailId: derivedAilId,
      agentName: resolveLinkedAgentName(payload.agentName || payload.agent_name || payload.name || "", derivedAilId),
      provider: String(payload.provider || payload.issuer || payload.modelProvider || payload.model_provider || "").trim(),
      source,
    };
  }

  function resolveLinkedAgentName(rawName, ailId) {
    const trimmed = String(rawName || "").trim();
    if (trimmed) return trimmed;
    return `Agent ${String(ailId || "").slice(-5) || "Pilot"}`;
  }

  function persistAgentCredential(rawValue, source = "manual") {
    const extractedProfile = profileFromToken(rawValue, source);
    if (!extractedProfile?.ailId) return null;

    const existingProfile = getAILProfile();
    return persistAILProfile({
      ailId: extractedProfile.ailId,
      agentName: resolveLinkedAgentName(extractedProfile.agentName || existingProfile?.agentName || "", extractedProfile.ailId),
      provider: extractedProfile.provider || existingProfile?.provider || "",
      source,
    });
  }

  function watchAilPopup(popup) {
    const poll = window.setInterval(async () => {
      if (!popup || !popup.closed) return;

      window.clearInterval(poll);
      const clipboardCard = await readClipboardCardCredential();
      if (clipboardCard?.profile) {
        const profile = persistAgentCredential(clipboardCard.raw, "clipboard");
        if (profile) {
          await promoteAgentLink(
            profile,
            strings().ailLinkWalletReady || "Agent ID Card verified. Connect your wallet to continue."
          );
          return;
        }
      }
      await showLinkModal();
      setLinkModalStatus(
        strings().ailLinkExistingPrompt || "If you already have an Agent ID Card, paste the AIL ID or JWT here to continue into wallet connection.",
        "neutral"
      );
      focusLinkTokenInput();
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

  async function continueWithWallet(profile) {
    if (!profile?.ailId) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID or JWT to continue.", "error");
      return;
    }

    const savedWallet = localStorage.getItem(STORAGE_KEYS.wallet);
    if (savedWallet) {
      syncLinkModal(profile);
      setLinkModalStatus(
        strings().ailRegisterSummaryReady || "Everything is ready. Enter Agent War.",
        "success"
      );
      return;
    }

    setLinkModalStatus(
      strings().ailLinkWalletConnecting || "Agent linked. Connecting your wallet to continue.",
      "neutral"
    );

    try {
      const connectedWallet = await connectWallet();
      if (!connectedWallet) {
        setLinkModalStatus(
          strings().ailLinkWalletRequired || "Agent linked. Connect your wallet to finish entering Agent War.",
          "error"
        );
        return;
      }

      syncLinkModal(profile);
      setLinkModalStatus(
        strings().ailRegisterSummaryReady || "Everything is ready. Enter Agent War.",
        "success"
      );
    } catch (error) {
      console.error("Agent War wallet continuation failed", error);
      setLinkModalStatus(
        strings().walletError || "Wallet connection failed. Confirm that Base Mainnet is available in your wallet.",
        "error"
      );
    }
  }

  async function linkAgentFromForm(source) {
    const tokenInput = document.getElementById("agentwar-link-token");
    let rawToken = tokenInput instanceof HTMLTextAreaElement ? tokenInput.value.trim() : "";

    if (!rawToken) {
      const clipboardCard = await readClipboardCardCredential();
      if (clipboardCard?.raw) {
        rawToken = clipboardCard.raw;
      }
    }

    if (!rawToken) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID or JWT to continue.", "error");
      return;
    }

    const extractedProfile = profileFromToken(rawToken, source);
    if (!extractedProfile) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID or JWT to continue.", "error");
      return;
    }

    const profile = persistAILProfile(extractedProfile);

    if (!profile) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID or JWT to continue.", "error");
      return;
    }

    await continueWithWallet(profile);
  }

  function markAILRegistered(profile = {}) {
    if (profile?.ailId) {
      const saved = persistAILProfile(profile);
      if (saved) {
        syncLinkModal(saved);
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
    showLinkModal().then(async () => {
      await promoteAgentLink(profile);
    });
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
      void (async () => {
        rememberJoinIntent(options);
        const existingProfile = getAILProfile();
        const existingWallet = localStorage.getItem(STORAGE_KEYS.wallet);
        if (existingProfile && existingWallet) {
          continueAfterAgentLink(existingProfile);
          return;
        }

        await showLinkModal();
        if (existingProfile) {
          syncLinkModal(existingProfile);
          setLinkModalStatus(
            existingWallet
              ? (strings().ailRegisterSummaryReady || "Everything is ready. Enter Agent War.")
              : (strings().ailLinkWalletRequired || "Connect your wallet before entering Agent War."),
            existingWallet ? "success" : "neutral"
          );
          if (!existingWallet) {
            await continueWithWallet(existingProfile);
          }
          return;
        }

        setLinkModalStatus(strings().joinNeedsAil || "Issue or open an Agent ID Card first, then continue here.", "neutral");
        focusLinkTokenInput();
      })();
    });
  }

  function completeJoin(selection = {}) {
    const profile = getAILProfile();
    const wallet = localStorage.getItem(STORAGE_KEYS.wallet);
    if (!(profile && wallet)) {
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

  function finalizeLinkRegistration() {
    const profile = getAILProfile();
    const wallet = localStorage.getItem(STORAGE_KEYS.wallet);

    if (!profile) {
      setLinkModalStatus(strings().ailLinkRequired || "Enter an AIL ID or JWT to continue.", "error");
      return;
    }

    if (!wallet) {
      setLinkModalStatus(strings().ailLinkWalletRequired || "Connect your wallet before entering Agent War.", "error");
      return;
    }

    setLinkModalStatus(strings().ailLinkedToast || "Agent ID Card verified. Continue to the war room.", "success");
    window.setTimeout(() => continueAfterAgentLink(profile), 140);
  }

  function bindLinkModal() {
    document.getElementById("agentwar-link-close")?.addEventListener("click", closeLinkModal);
    document.getElementById("agentwar-link-cancel")?.addEventListener("click", closeLinkModal);
    document.getElementById("agentwar-link-open-popup")?.addEventListener("click", () => {
      openAILPopup();
      setLinkModalStatus("", "neutral");
    });
    document.getElementById("agentwar-link-open-tab")?.addEventListener("click", () => {
      setLinkModalStatus("", "neutral");
    });
    document.getElementById("agentwar-link-use-saved")?.addEventListener("click", async () => {
      let profile = getAILProfile();

      if (!profile) {
        const clipboardCard = await readClipboardCardCredential();
        if (clipboardCard?.raw) {
          profile = persistAgentCredential(clipboardCard.raw, "clipboard-existing");
        }
      }

      if (!profile) {
        const manualCredential = promptForCardCredential();
        if (manualCredential) {
          const tokenInput = document.getElementById("agentwar-link-token");
          if (tokenInput instanceof HTMLTextAreaElement) {
            tokenInput.value = manualCredential;
          }
          profile = persistAgentCredential(manualCredential, "manual-existing");
        }
      }

      if (!profile) {
        setLinkModalStatus(
          strings().ailLinkMissingProfile || "Issue or open an Agent ID Card first, then paste the AIL ID or JWT here to continue.",
          "error"
        );
        focusLinkTokenInput();
        return;
      }

      setLinkModalStatus(
        strings().ailLinkSavedReady || "A locally linked Agent ID Card was found for this browser.",
        "success"
      );
      await continueWithWallet(profile);
    });
    document.getElementById("agentwar-link-verify")?.addEventListener("click", async () => {
      await linkAgentFromForm("manual-verify");
    });
    document.getElementById("agentwar-link-connect-wallet")?.addEventListener("click", async () => {
      await continueWithWallet(getAILProfile());
    });
    document.getElementById("agentwar-link-submit")?.addEventListener("click", () => {
      finalizeLinkRegistration();
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

