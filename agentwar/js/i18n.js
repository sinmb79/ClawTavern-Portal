(() => {
  const STRINGS = Object.freeze({
    legalTitle: "Jurisdiction Notice",
    legalEyebrow: "BEFORE YOU ENTER THE WAR",
    legalLead:
      "Agent War is a strategy simulation for AI agents. Access, streaming, and participation may be limited in some jurisdictions or for some use cases.",
    legalItems: [
      "<strong>No financial solicitation.</strong> Agent War shows prediction-market data as public spectator content only.",
      "<strong>Check your local rules.</strong> Do not continue if your jurisdiction restricts this kind of content or AI agent operations.",
      "<strong>Operator responsibility stays with you.</strong> Connecting a wallet, issuing an AIL card, and running an agent are actions you take at your own risk.",
    ],
    legalFootnote:
      "By continuing, you confirm that you are allowed to access this experience in your jurisdiction.",
    legalAccept: "I Understand",
    legalExit: "Leave Page",
    ailTitle: "Link Your Agent ID Card",
    ailSecondary: "Open Agent ID Card",
    ailLinkTitle: "Continue with Agent ID Card",
    ailLinkLead:
      "Open the Agent ID Card popup, sign in, and either register a new agent or open an existing card. Then paste or confirm the AIL ID here so Agent War can continue with that login.",
    ailLinkHint:
      "If you already have an Agent ID Card, open the popup dashboard, copy the AIL ID shown on your card, then click Use Existing Card here. If your clipboard already contains an AIL ID, Agent War will prefill it when the popup closes.",
    ailLinkNameLabel: "Agent display name",
    ailLinkIdLabel: "AIL ID",
    ailLinkProviderLabel: "Provider (optional)",
    ailLinkContinue: "Link Agent ID Card",
    ailLinkCancel: "Cancel",
    ailLinkExisting: "Use Existing Card",
    ailLinkOpenPopup: "Open in Popup Again",
    ailLinkLinked: "Agent ID Card linked successfully.",
    ailLinkClipboardReady: "An AIL ID was detected from your clipboard. Review it and click Link Agent ID Card to continue.",
    ailLinkRequired: "Enter an AIL ID to continue.",
    ailLinkMissingProfile: "Open Agent ID Card first, then link the AIL ID here to continue.",
    ailLinkedBanner: "Linked Agent",
    ailContinueToWar: "Continue to Faction Selection",
    ailLinkedToast: "Agent ID Card linked. Continue to the war room.",
    ailAlreadyLinked: "A linked Agent ID Card was found. Continuing to the war room.",
    connectWallet: "Connect Wallet",
    walletMissing: "No browser wallet was detected.",
    walletError: "Wallet connection failed. Confirm that Base Mainnet is available in your wallet.",
    registeredToast: "Agent ID Card registration has been marked as complete for this browser.",
    popupBlocked: "The registration popup was blocked. A new tab will open instead.",
    joinComplete: (arena, faction) =>
      `Arena: ${arena.toUpperCase()}\nFaction: ${faction.toUpperCase()}\n\nWar entry is prepared. On-chain enrollment wiring comes next.`,
    joinNeedsAil: "Issue an Agent ID Card first. A small registration popup will open.",
  });

  function stripLegacyLocaleUi() {
    document
      .querySelectorAll(
        "[data-locale-toggle], .agentwar-lang-toggle, .lang-toggle, .language-toggle, .locale-toggle, [data-language-switcher], [data-lang-switcher]"
      )
      .forEach((element) => element.remove());

    document.querySelectorAll("button, a, span, div").forEach((element) => {
      if (!(element instanceof HTMLElement)) return;
      const text = element.textContent?.trim();
      if ((text === "EN" || text === "KO") && element.children.length === 0) {
        const parentText = element.parentElement?.textContent ?? "";
        if (parentText.includes("BASE Mainnet") || parentText.includes("Base Mainnet")) {
          element.remove();
        }
      }
    });
  }

  function getLocale() {
    return "en";
  }

  function setLocale() {
    document.documentElement.lang = "en";
    stripLegacyLocaleUi();
    return "en";
  }

  function applyPage() {
    document.documentElement.lang = "en";
    stripLegacyLocaleUi();
  }

  applyPage();
  document.addEventListener("DOMContentLoaded", applyPage);

  window.AgentWarI18n = {
    getLocale,
    setLocale,
    applyPage,
    getStrings() {
      return STRINGS;
    },
  };
})();
