/* Opens YouTube's own unsubscribe confirmation for one channel. It never clicks the final confirm
   button: the user confirms in YouTube's dialog. Buttons are recognized by their visible text, because
   the signed-in markup changes often; other YouTube interface languages are reported as unsupported. */
(function (root) {
  "use strict";
  const Core = root.YCGCore, Dom = root.YCGDom;
  const SUBSCRIBED = /^(已订阅|已訂閱|Subscribed)$/i, SUBSCRIBE = /^(订阅|訂閱|Subscribe)$/i, UNSUBSCRIBE = /^(取消订阅|取消訂閱|Unsubscribe)$/i;
  const AREA = "#subscribe-button, ytd-subscribe-button-renderer, yt-subscribe-button-view-model";
  const HEADER = "ytd-page-header-renderer, yt-page-header-renderer, #page-header, #channel-header";
  const text = element => (element.innerText ?? element.textContent).trim().replace(/\s+/g, " ");
  const visible = element => !!element?.isConnected && element.getClientRects().length > 0 && element.ownerDocument.defaultView.getComputedStyle(element).visibility !== "hidden";
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  // The subscribe control of this channel on the current page: its card in a channel list, or the header of its own page.
  function area(document, pathname, channel) {
    const aliases = new Set(channel.aliases);
    for (const card of document.querySelectorAll("ytd-channel-renderer, ytd-grid-channel-renderer")) {
      if (Dom.identity(card)?.aliases.some(alias => aliases.has(alias))) return card.querySelector(AREA);
    }
    const page = Dom.current(document, pathname);
    if (!page?.aliases.some(alias => aliases.has(alias))) return null;
    for (const header of document.querySelectorAll(HEADER)) {
      const control = header.querySelector(AREA);
      if (control) return control;
    }
    return null;
  }
  function status(control) {
    const buttons = control ? [...control.querySelectorAll("button, a, [role=button]")].filter(visible) : [];
    const subscribed = buttons.find(button => SUBSCRIBED.test(text(button)));
    if (subscribed) return {state: "subscribed", button: subscribed};
    if (buttons.some(button => SUBSCRIBE.test(text(button)))) return {state: "unsubscribed"};
    return {state: "unknown"};
  }
  // YouTube has used several dialog elements. The panel lives in a shadow root, so these never match it.
  const DIALOG = "yt-confirm-dialog-renderer, tp-yt-paper-dialog, yt-dialog-view-model, dialog[open], [role=dialog], [role=alertdialog]";
  function dialog(document) { return [...document.querySelectorAll(DIALOG)].find(visible) || null; }
  function menuItem(document) {
    return [...document.querySelectorAll("ytd-popup-container :is([role=menuitem], tp-yt-paper-item, yt-list-item-view-model, ytd-menu-service-item-renderer)")]
      .find(item => visible(item) && UNSUBSCRIBE.test(text(item))) || null;
  }
  async function until(find, timeout) {
    for (const end = Date.now() + timeout; Date.now() < end; await pause(100)) { const found = find(); if (found) return found; }
    return null;
  }
  // Older YouTube opens the dialog directly; newer YouTube first opens a menu with an "Unsubscribe" item.
  // Returns the dialog, or null when YouTube's confirmation uses markup that is not recognized: the caller
  // then waits for the button state alone, because the user may still confirm in that dialog.
  async function open(document, button) {
    const menu = () => { const item = menuItem(document); return item && !item.closest(DIALOG) ? item : null; };
    button.click();
    const first = await until(() => menu() || dialog(document), 5000);
    if (!first) throw new Error("未能打开 YouTube 的取消订阅菜单。请在 YouTube 中手动取消订阅。");
    if (first !== menuItem(document)) return first;
    first.click();
    return until(() => dialog(document), 5000);
  }
  // The result comes from the subscribe button, not the dialog: "done" once YouTube shows "Subscribe" again.
  // "cancelled" when a recognized dialog closed without that change, or after the timeout.
  async function wait(document, findArea, {timeout = 120000, signal, seenDialog = false} = {}) {
    for (const end = Date.now() + timeout; Date.now() < end && !signal?.aborted; await pause(250)) {
      if (status(findArea()).state === "unsubscribed") return "done";
      if (dialog(document)) { seenDialog = true; continue; }
      if (seenDialog) {
        const settled = await until(() => status(findArea()).state === "unsubscribed", 3000);
        return settled ? "done" : "cancelled";
      }
    }
    return "cancelled";
  }
  // Channel cards on the list page, except those that already show "Subscribe": YouTube keeps a card
  // unsubscribed in this page session until the next reload.
  function subscribedCards(document) {
    return [...document.querySelectorAll("ytd-channel-renderer, ytd-grid-channel-renderer")]
      .filter(card => status(card.querySelector(AREA)).state !== "unsubscribed").map(card => Dom.identity(card)).filter(Boolean);
  }
  root.YCGUnsubscribe = {area, status, open, wait, subscribedCards};
})(globalThis);
