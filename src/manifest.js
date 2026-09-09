const manifest = {
  id: "paperclip-korean-ui",
  apiVersion: 1,
  version: "1.1.3",
  displayName: "한글 UI",
  description: "Paperclip 크롬을 한국어로 덮고 한/EN으로 원문을 되돌린다. dist를 수정하지 않는다.",
  author: "thrill",
  categories: ["ui"],
  capabilities: ["ui.action.register"],
  entrypoints: {
    worker: "dist/worker.js",
    ui: "dist/ui",
  },
  ui: {
    slots: [
      {
        type: "globalToolbarButton",
        id: "language-toggle",
        displayName: "Language",
        exportName: "LanguageToggle",
      },
    ],
  },
};

export default manifest;
