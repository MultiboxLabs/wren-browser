// What Wren changes in the Chrome Web Store, in the store's own world, from
// before its first script runs. What it hides is in chrome-web-store.css.

// The store assigns window.IJ_values in an inline <script id="_ij">. The
// server leaves index 24 (`Mk`, "this request came from Google Chrome")
// false for any other browser, and the store then shows "Switch to Chrome to
// install extensions and themes" in place of every other banner, such as
// "This item is inactive". Real Chrome gets true, and the store then asks
// the browser about the extension.
(() => {
  let values;
  Object.defineProperty(window, "IJ_values", {
    configurable: true,
    get: () => values,
    set(value) {
      if (Array.isArray(value) && value.length === 56) value[24] = true;
      values = value;
    }
  });
})();

// Says Wren where the store names the browser an extension is added to or
// removed from: "Add to Chrome", "Remove from Chrome" and the message after
// it. The store renders these as it goes (and again as the extension's state
// changes), so every text and label it adds is rewritten as it arrives.
// "Chrome Web Store" and the like stay: that is the store's own name.
(() => {
  const wording = [
    [/\b(Add to|Added to|Remove from|removed from|add this item to) Chrome\b/g, "$1 Wren"],
    [/\bcurrent Chrome version\b/g, "current Wren version"]
  ];
  const labels = ["aria-label", "title"];

  const rewrite = (text) => wording.reduce((text, [from, to]) => text.replace(from, to), text);

  function fix(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = rewrite(node.nodeValue);
      if (text !== node.nodeValue) node.nodeValue = text;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches("script, style")) return;
    for (const label of labels) {
      const value = node.getAttribute(label);
      if (value !== null && rewrite(value) !== value) node.setAttribute(label, rewrite(value));
    }
    node.childNodes.forEach(fix);
  }

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "childList") record.addedNodes.forEach(fix);
      else fix(record.target);
    }
  }).observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: labels
  });
})();
