import { useEffect, useState } from "react";
import { createElement } from "react";
import { getUiLanguage, setUiLanguage, startOverlay } from "./overlay.js";

export function LanguageToggle() {
  const [lang, setLang] = useState(() => getUiLanguage());

  useEffect(() => {
    startOverlay();
    const onChange = () => setLang(getUiLanguage());
    window.addEventListener("paperclip-ui-language", onChange);
    return () => window.removeEventListener("paperclip-ui-language", onChange);
  }, []);

  function choose(next) {
    setUiLanguage(next);
    setLang(next);
  }

  return createElement(
    "div",
    {
      "data-language-toggle": "true",
      "data-pc-i18n-skip": "true",
      title: "UI language",
      style: {
        display: "inline-flex",
        alignItems: "center",
        gap: "2px",
        height: "32px",
        padding: "2px",
        borderRadius: "8px",
        border: "1px solid var(--border, rgba(127,127,127,0.35))",
        fontSize: "12px",
      },
    },
    createElement(
      "button",
      {
        type: "button",
        onClick: () => choose("ko"),
        "aria-pressed": lang === "ko",
        style: buttonStyle(lang === "ko"),
      },
      "한",
    ),
    createElement(
      "button",
      {
        type: "button",
        onClick: () => choose("en"),
        "aria-pressed": lang === "en",
        style: buttonStyle(lang === "en"),
      },
      "EN",
    ),
  );
}

function buttonStyle(active) {
  return {
    minWidth: "28px",
    height: "26px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    font: "inherit",
    background: active ? "var(--accent, rgba(127,127,127,0.25))" : "transparent",
    color: "inherit",
    fontWeight: active ? 600 : 500,
  };
}
