/* Yielding work is cancellable; stale searches and navigation cannot overwrite newer results. */
(function (root) {
  "use strict";
  async function yieldToMain() {
    if (root.scheduler?.yield) await root.scheduler.yield();
    else await new Promise(resolve => setTimeout(resolve, 0));
  }
  async function each(items, visit, current = () => true, budget = 4) {
    let start = performance.now();
    for (let i = 0; i < items.length; i++) {
      if (!current()) return false;
      visit(items[i], i);
      if (performance.now() - start >= budget) { await yieldToMain(); start = performance.now(); }
    }
    return current();
  }
  root.YCGWork = {each, yieldToMain};
  if (typeof module !== "undefined") module.exports = root.YCGWork;
})(globalThis);
