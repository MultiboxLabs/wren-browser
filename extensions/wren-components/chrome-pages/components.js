// How Chromium's shared components (cr_elements: buttons, switches, fields,
// menus, dialogs) are drawn on its pages, in the palette of theme.css; and
// the controls of a page that builds its own (chrome://flags).
//
// Each component sets its look on itself, in `:host` rules inside its shadow
// root. A rule in the scope around a component outranks those, as CSS ranks
// the outer context first, so most of this restyles a component from
// outside: by its tag, its documented classes (`.action-button`) and the
// custom properties it reads, which are its theming interface. Those rules
// are in :where(), at no specificity, so a page's own rules for its
// components still win. Only what a component offers nothing for (the
// switch's knob, a radio button's dot) is drawn from inside it, as
// `:host(tag) part`. Should Chromium change any of it, that control falls
// back to Chromium's look; `bun run check` names every tag, part and
// property here that its pages no longer have.
//
// Every shadow root is the scope around the components inside it, so this
// adopts one sheet into every shadow root as it is made (and the document),
// in the page's own world and before the page's first script. Components
// set their own sheets after, replacing the list, so each root keeps this
// one last in it.
(() => {
  const css = String.raw`
    /* Buttons: a soft pill, a tonal fill and no edge, deeper under the
       pointer; the one that matters in ink. A plain button is Chromium's
       tonal one already. No ripple. Disabled, it fades and keeps its
       colours. */
    :where(cr-button:not(.floating-button)) {
      --cr-button-background-color: var(--wren-control);
      --cr-button-text-color: var(--wren-fg);
      --cr-button-border: 1px solid transparent;
      --cr-button-ripple-opacity: 0;
      --cr-button-disabled-background-color: var(--cr-button-background-color);
      --cr-button-disabled-text-color: var(--cr-button-text-color);
      --cr-button-disabled-border: var(--cr-button-border);
      border-radius: var(--wren-radius-button);
      font-size: 13px;
      font-weight: 500;
      padding-inline: 15px;
      transition: opacity 120ms;
    }
    :where(cr-button.action-button) {
      --cr-button-background-color: var(--wren-ink);
      --cr-button-text-color: var(--wren-on-ink);
    }
    :where(cr-button:active) {
      --cr-hover-background-color: var(--wren-pressed);
    }
    :where(cr-button.action-button:active) {
      --cr-hover-on-prominent-background-color: var(--wren-ink-hover);
      filter: brightness(0.92);
    }
    :where(cr-button[disabled]) {
      opacity: 0.45;
    }

    /* Chips (a set of filters): pills as the buttons are, the selected one
       in ink (theme.css). */
    :where(cr-chip) {
      --cr-chip-border-radius: var(--wren-radius-button);
      --cr-chip-font-size: 13px;
      --cr-chip-height: 30px;
    }
    :host(cr-chip) button {
      padding-inline: 12px;
    }
    :host(cr-chip) button:not([selected]) {
      background-color: var(--wren-control);
      border-color: transparent;
    }
    :host(cr-chip) button:not([selected], [disabled]):hover {
      background-color: var(--wren-control-hover);
      border-color: transparent;
    }

    /* Icon buttons: a rounded square under the pointer, not a circle. */
    :where(cr-icon-button) {
      --cr-icon-button-hover-background-color: var(--wren-hover);
      --cr-icon-button-active-background-color: var(--wren-pressed);
      border-radius: var(--wren-radius-icon-button);
    }

    /* Switches: a pill with a round knob that fills its height and casts a
       slight shadow, ink when on. It does not swell as it is pressed, nor
       ring under the pointer. Disabled, it fades. */
    :where(cr-toggle) {
      --cr-toggle-bar-width: 30px;
      --cr-toggle-bar-border: none;
      --cr-toggle-knob-diameter: 14px;
      --cr-toggle-unchecked-bar-color: var(--wren-switch-off);
      --cr-toggle-checked-bar-color: var(--wren-ink);
      --cr-toggle-unchecked-button-color: var(--wren-knob-off);
      --cr-toggle-checked-button-color: var(--wren-knob-on);
      --cr-toggle-unchecked-ripple-color: transparent;
      --cr-toggle-checked-ripple-color: transparent;
      --cr-hover-on-subtle-background-color: transparent;
    }
    :where(cr-toggle[disabled]) {
      opacity: 0.4;
    }
    :host(cr-toggle) #bar {
      height: 18px;
      transition: background-color 160ms ease-out;
    }
    :host(cr-toggle) #knob {
      --cr-toggle-knob-center-edge-distance_: 9px;
      box-shadow:
        0 0 0 0.5px rgb(0 0 0 / 0.06),
        0 1px 2px rgb(0 0 0 / 0.22);
      transition:
        transform 180ms cubic-bezier(0.3, 0.7, 0.4, 1),
        background-color 160ms ease-out;
    }

    /* Check boxes: a rounded square of hairline; ink with a white mark when
       checked. */
    :where(cr-checkbox) {
      --cr-checkbox-size: 16px;
      --cr-checkbox-border-size: 1px;
      --cr-checkbox-unchecked-box-color: var(--wren-mark-edge);
      --cr-checkbox-checked-box-color: var(--wren-ink);
      --cr-checkbox-mark-color: var(--wren-on-ink);
      --cr-checkbox-ripple-opacity: 0;
      --cr-hover-background-color: transparent;
    }
    :where(cr-checkbox[disabled]) {
      opacity: 0.45;
    }
    :host(cr-checkbox) #checkbox {
      border-radius: 4.5px;
    }

    /* Radio buttons: a hairline ring; filled with ink, and a white dot in
       it, when checked. */
    :where(cr-radio-button) {
      --cr-radio-button-checked-color: var(--wren-ink);
      --cr-radio-button-unchecked-color: var(--wren-mark-edge);
      --cr-radio-button-checked-ripple-color: transparent;
      --cr-radio-button-unchecked-ripple-color: transparent;
      --cr-hover-background-color: transparent;
    }
    :where(cr-radio-button[disabled]) {
      opacity: 0.45;
    }
    :host(cr-radio-button) .disc-border {
      border-width: 1px;
    }
    :host(cr-radio-button[checked]) .disc-border {
      background: var(--cr-radio-button-checked-color);
    }
    :host(cr-radio-button[checked]) .disc {
      background-color: var(--wren-on-ink);
      transform: scale(0.375);
    }

    /* Text fields: a box with a hairline all round, not a filled one with an
       underline. Focused, its edge darkens and a soft halo shows. */
    :where(cr-input) {
      --cr-input-background-color: var(--wren-field);
      --cr-input-border: 1px solid var(--wren-field-edge);
      --cr-input-border-bottom: none;
      --cr-input-border-radius: var(--wren-radius-row);
      --cr-input-underline-display: none;
      --cr-input-hover-background-color: transparent;
      --cr-input-focus-outline: 3px solid var(--wren-field-halo);
      --cr-input-font-size: 13px;
      --cr-input-padding-top: 7px;
      --cr-input-padding-bottom: 7px;
      --cr-input-padding-start: 10px;
      --cr-input-padding-end: 10px;
    }
    :where(cr-input[focused_]) {
      --cr-input-border: 1px solid var(--wren-field-edge-focused);
    }
    :where(cr-input[invalid]) {
      --cr-input-border: 1px solid var(--cr-input-error-color);
    }

    /* The toolbar's search field: a filled, rounded rectangle, not a pill,
       that turns into a text field while focused. Pages focus it as they
       open, so it shows no halo: only its edge. */
    :where(cr-toolbar-search-field:not([narrow])) {
      --cr-toolbar-search-field-border-radius: var(--wren-radius-row);
      height: 32px;
      outline-offset: -1px;
      outline-width: 1px;
    }
    :where(cr-toolbar-search-field[search-focused_]:not([narrow])) {
      --cr-toolbar-search-field-background: var(--wren-field);
      --cr-focus-outline-color: var(--wren-field-edge);
    }
    :host(cr-toolbar-search-field) :is(#searchTerm, input) {
      font-size: 13px;
      font-weight: 400;
    }

    /* The toolbar's title: smaller and tighter than Chromium's. */
    :where(cr-toolbar) {
      --cr-toolbar-header-font-weight: 600;
    }
    :host(cr-toolbar) h1 {
      font-size: 18px;
      letter-spacing: -0.01em;
    }

    /* The sidebars' rows: rounded rectangles that sit inside the sidebar,
       the selected one a shade darker, not coloured. */
    .cr-nav-menu-item {
      --cr-nav-menu-item-color: var(--wren-fg);
      --cr-nav-menu-item-color-selected: var(--wren-fg);
      --cr-nav-menu-item-background-color-hover: var(--wren-hover);
      --cr-nav-menu-item-background-color-selected: var(--wren-selected);
      --cr-nav-menu-item-icon-color: var(--wren-fg-2);
      --cr-nav-menu-item-icon-color-hover: var(--wren-fg-2);
      --cr-nav-menu-item-icon-color-selected: var(--wren-fg);
      --iron-icon-height: 18px;
      --iron-icon-width: 18px;
      border-radius: var(--wren-radius-row);
      font-size: 13px;
      font-weight: 400;
      line-height: 16px;
      margin-inline: 10px;
      min-height: 34px;
      padding-block: 9px;
      padding-inline: 10px;
    }
    .cr-nav-menu-item[selected] {
      font-weight: 500;
    }
    .cr-nav-menu-item :is(cr-icon, iron-icon) {
      margin-inline-end: 12px;
    }
    .cr-nav-menu-item:focus {
      outline: none;
    }
    .cr-nav-menu-item:focus-visible {
      outline: 2px solid var(--wren-focus);
      outline-offset: -2px;
    }

    /* Menus: a raised box with soft corners and a margin round its items,
       which highlight as rounded rows; the keyboard's item too, with no
       ring. */
    :host(cr-action-menu) dialog {
      padding: 5px;
    }
    :where(.dropdown-item) {
      border-radius: var(--wren-radius-menu-item);
      min-height: 28px;
      padding: 4px 10px;
    }
    :where(.dropdown-item:focus-visible) {
      outline: none;
    }

    /* Dialogs: larger corners, a softer shadow and a lighter backdrop. */
    :host(cr-dialog) dialog {
      background-image: none;
      box-shadow: var(--wren-shadow-dialog);
    }
    :host(cr-dialog) dialog::backdrop {
      background-color: var(--wren-backdrop);
    }

    /* Selects: a pop-up button, as the buttons are, with up and down
       arrows. */
    .md-select {
      --md-arrow-width: 8px;
      --md-select-bg-color: var(--wren-control);
      --md-select-option-bg-color: var(--wren-raised);
      --md-select-side-padding: 13px;
      background-image: var(--wren-chevrons);
      background-size: 8px 12px;
      border: none;
      border-radius: var(--wren-radius-button);
      font-size: 13px;
      height: 30px;
    }
    .md-select:hover {
      background-color: var(--wren-control-hover);
    }
    .md-select:focus {
      outline: 2px solid var(--wren-focus);
      outline-offset: 1px;
    }

    /* Tabs: the selected one in the text's colour, at the text's size. */
    :where(cr-tabs) {
      --cr-tabs-selected-color: var(--wren-fg);
      --cr-tabs-font-size: 13px;
      --cr-tabs-height: 40px;
    }

    /* chrome://flags builds its own controls, not the shared ones, in
       colours it sets on its app. Its search field is filled, as the
       toolbars' are, and its selects are pop-up buttons; a flag that is
       not at its default has its select in ink. */
    :where(flags-app) {
      --primary-color: var(--wren-fg);
      --secondary-color: var(--wren-fg-2);
      --interactive-color: var(--wren-ink);
      --link-color: var(--wren-fg);
      --focus-shadow-color: var(--wren-focus);
      --input-background: var(--wren-fill);
      --separator-color: var(--wren-separator);
      --toolbar-color: var(--wren-page);
      --google-blue-600: var(--wren-fg);
      --google-blue-300: var(--wren-fg);
      background: var(--wren-page);
    }
    :host(flags-app) #search {
      border-radius: var(--wren-radius-row);
      padding-block: 9px;
    }
    :host(flags-app) #search:focus-visible {
      background-color: var(--wren-field);
      box-shadow: inset 0 0 0 1px var(--wren-field-edge);
    }
    :host(flags-experiment) select {
      appearance: none;
      background: var(--wren-control) var(--wren-chevrons) no-repeat right 12px center / 8px 12px;
      border: none;
      border-radius: var(--wren-radius-button);
      color: var(--wren-fg);
      height: 30px;
      padding-inline: 13px 28px;
      text-align-last: start;
    }
    :host(flags-experiment[is-default_]) select:hover {
      background-color: var(--wren-control-hover);
    }
    :host(flags-experiment:not([is-default_])) select {
      background-color: var(--wren-ink);
      background-image: var(--wren-chevrons-on-ink);
      color: var(--wren-on-ink);
    }

    /* Settings pages Wren has no use for, out of the sidebar. Chromium's own
       way to hide a page (its page visibility) is the page's module, which
       a script outside cannot reach. */
    :host(settings-menu) :is(#ai, #onStartup) {
      display: none;
    }

    /* Links are the text's colour here, so they are underlined to read as
       links. */
    :where(a[href]:not(.cr-nav-menu-item)) {
      text-decoration: underline;
      text-decoration-color: var(--wren-fg-3);
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
    }
    :where(a[href]:not(.cr-nav-menu-item):hover) {
      text-decoration-color: currentColor;
    }
  `;

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(css);

  // The root's own list of sheets, with this one moved last.
  const native = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, "adoptedStyleSheets");
  const withOurs = (sheets) => [...[...sheets].filter((own) => own !== sheet), sheet];

  function adopt(root) {
    native.set.call(root, withOurs(native.get.call(root)));
    Object.defineProperty(root, "adoptedStyleSheets", {
      configurable: true,
      enumerable: true,
      get: () => native.get.call(root),
      set: (sheets) => native.set.call(root, withOurs(sheets))
    });
  }

  const attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (init) {
    const root = attachShadow.call(this, init);
    adopt(root);
    return root;
  };

  // The document is the scope around a page's app (flags-app). Pages add
  // their own sheets to its list, keeping what is there.
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
})();
