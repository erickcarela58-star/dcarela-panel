(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.DcarelaShellRoute = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const frames = new WeakMap();
  // The initial iframe must open the requested module. Keep its source stable
  // while navigating inside the same session, so existing forms are preserved.
  function frameSource(ref, business, login, route, resolve) {
    const key = JSON.stringify([business, Boolean(login)]);
    const previous = frames.get(ref);
    if (previous?.key === key) return previous.url;
    const url = resolve(route);
    frames.set(ref, { key, url });
    return url;
  }
  return { frameSource };
});
