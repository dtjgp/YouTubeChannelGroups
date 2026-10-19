(function (root) {
  "use strict";
  const Core = root.YCGCore;
  const CARD_SELECTOR = "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, yt-lockup-view-model";
  const CHANNEL_SELECTOR = "ytd-channel-renderer, ytd-grid-channel-renderer";
  const cache = new WeakMap();
  function cachedIdentity(element) { if (!cache.has(element)) cache.set(element, identity(element)); return cache.get(element); }
  function invalidate(records) {
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const card = target?.closest(`${CARD_SELECTOR}, ${CHANNEL_SELECTOR}`);
      if (card) cache.delete(card);
    }
  }

  function avatarFrom(element, selector) {
    for (const image of element.querySelectorAll(selector)) {
      if (image.closest("#description, #description-container, yt-description-preview-view-model")) continue;
      const url = Core.avatar(image.currentSrc) || Core.avatar(image.getAttribute("src")) || Core.avatar(image.getAttribute("data-src"));
      if (url) return url;
    }
    return null;
  }
  // ytd-channel-name repeats the name in a hidden hover tooltip; textContent would return it twice.
  function nameText(node) {
    if (!node) return "";
    const source = node.matches("yt-formatted-string") ? node : node.querySelector("yt-formatted-string#text") || node;
    const walker = source.ownerDocument.createTreeWalker(source, 4);
    let text = "";
    while (walker.nextNode()) if (!walker.currentNode.parentElement?.closest("tp-yt-paper-tooltip, [role=tooltip]")) text += walker.currentNode.nodeValue;
    return text.trim();
  }
  function identity(element) {
    const allLinks = [...element.querySelectorAll("a[href]")].map(link => ({link, path: Core.path(link.getAttribute("href"))})).filter(item => item.path);
    const preferred = allLinks.filter(({link}) => link.matches("#main-link, #channel-title, #avatar, #channel-thumbnail, #channel-name a, ytd-channel-name a, .yt-lockup-metadata-view-model__metadata a, .yt-content-metadata-view-model__metadata-row a"));
    // Descriptions can mention other channels. Those links are not aliases.
    const links = preferred.length ? preferred : allLinks.filter(({link}) => !link.closest("#description, #description-container, yt-description-preview-view-model"));
    if (!links.length) return null;
    const named = links.find(({link}) => link.matches("#main-link, #channel-title, #channel-name a, .yt-lockup-metadata-view-model__metadata a, .yt-content-metadata-view-model__metadata-row a") && link.textContent.trim()) || links.find(({link}) => link.textContent.trim());
    const titleNode = element.querySelector("#channel-title, #channel-name, yt-formatted-string#text");
    const title = (nameText(titleNode) || nameText(named?.link) || links[0].path).trim().replace(/\s+/g, " ").slice(0, 200);
    const description = element.querySelector("#description, #description-container")?.textContent.trim().replace(/\s+/g, " ").slice(0, 600) || "";
    const avatarUrl = avatarFrom(element, "#avatar img, #channel-thumbnail img, #main-link img, yt-avatar-shape img, .yt-spec-avatar-shape__image");
    return {id: links[0].path, title, aliases: [...new Set(links.map(item => item.path))], description, ...(avatarUrl ? {avatarUrl} : {})};
  }

  function collect(document, pathname) {
    if (pathname.replace(/\/$/, "") !== "/feed/channels") return [];
    return [...document.querySelectorAll(CHANNEL_SELECTOR)].map(identity).filter(Boolean);
  }
  async function collectAsync(document, pathname, current) {
    if (pathname.replace(/\/$/, "") !== "/feed/channels") return [];
    const items = [];
    const completed = await root.YCGWork.each([...document.querySelectorAll(CHANNEL_SELECTOR)], element => { const item = cachedIdentity(element); if (item) items.push(item); }, current);
    return completed ? items : null;
  }
  async function filterAsync(document, pathname, state, selected, current) {
    const subscriptions = pathname.replace(/\/$/, "") === "/feed/subscriptions";
    if (!subscriptions) { document.querySelectorAll("[data-ycg-hidden]").forEach(card => card.removeAttribute("data-ycg-hidden")); return {active: false, recognized: 0, visible: 0, unknown: 0}; }
    const active = selected !== "all", aliases = new Map();
    if (active) {
      if (!await root.YCGWork.each(state.channels, channel => channel.aliases.forEach(alias => aliases.set(alias, channel)), current)) return null;
    }
    const cards = [...document.querySelectorAll(CARD_SELECTOR)].filter(card => !card.parentElement?.closest(CARD_SELECTOR) && !card.closest("ytd-guide-renderer, ytd-mini-guide-renderer"));
    let recognized = 0, visible = 0;
    const complete = await root.YCGWork.each(cards, card => {
      const item = cachedIdentity(card);
      if (!item) { card.removeAttribute("data-ycg-hidden"); return; }
      recognized++;
      const show = !active || Core.matches(item.aliases.map(alias => aliases.get(alias)).find(Boolean), selected);
      if (card.hasAttribute("data-ycg-hidden") === show) card.toggleAttribute("data-ycg-hidden", !show);
      if (show) visible++;
    }, current);
    return complete ? {active, recognized, visible, unknown: cards.length - recognized} : null;
  }

  function current(document, pathname) {
    const id = Core.path(pathname);
    if (!id) return null;
    const title = [...document.querySelectorAll("ytd-page-header-renderer h1, yt-page-header-renderer h1, #channel-header-container #channel-name, ytd-c4-tabbed-header-renderer #channel-name, h1")].map(element => element.textContent.trim()).find(Boolean)
      || document.querySelector('meta[property="og:title"]')?.content?.trim() || id;
    const canonical = Core.path(document.querySelector('link[rel="canonical"]')?.href);
    const description = document.querySelector('meta[property="og:description"]')?.content?.trim().slice(0, 600) || "";
    const avatarUrl = avatarFrom(document, "ytd-page-header-renderer yt-avatar-shape img, yt-page-header-renderer yt-avatar-shape img, #channel-header-container #avatar img, ytd-c4-tabbed-header-renderer #avatar img") || Core.avatar(document.querySelector('meta[property="og:image"]')?.content);
    return {id, title: title.slice(0, 200), aliases: [id, canonical].filter(Boolean), description, ...(avatarUrl ? {avatarUrl} : {})};
  }

  function filter(document, pathname, state, selected) {
    const active = pathname.replace(/\/$/, "") === "/feed/subscriptions" && selected !== "all";
    if (!active) document.querySelectorAll("[data-ycg-hidden]").forEach(card => card.removeAttribute("data-ycg-hidden"));
    const aliases = new Map(state.channels.flatMap(channel => channel.aliases.map(alias => [alias, channel])));
    const cards = [...document.querySelectorAll(CARD_SELECTOR)].filter(card => !card.parentElement?.closest(CARD_SELECTOR) && !card.closest("ytd-guide-renderer, ytd-mini-guide-renderer"));
    let recognized = 0, visible = 0;
    for (const card of cards) {
      const item = identity(card);
      // Leave unsupported cards visible and disclose them, rather than guessing.
      if (!item) { card.removeAttribute("data-ycg-hidden"); continue; }
      recognized++;
      const channel = item.aliases.map(alias => aliases.get(alias)).find(Boolean);
      const show = !active || Core.matches(channel, selected);
      card.toggleAttribute("data-ycg-hidden", !show);
      if (show) visible++;
    }
    return {active, recognized, visible, unknown: cards.length - recognized};
  }

  // Scroll the subscription list until YouTube stops adding channels. "complete" means that the list
  // stopped growing and YouTube shows no continuation loader; the caller restores nothing else.
  async function loadAll(document, view, {shouldContinue, onProgress = () => {}, wait = 1200, patience = 3, maxRounds = 600}) {
    const count = () => document.querySelectorAll(CHANNEL_SELECTOR).length;
    const more = () => !!document.querySelector("ytd-continuation-item-renderer");
    const start = view.scrollY;
    let last = count(), still = 0, rounds = 0, stopped = false;
    while (rounds < maxRounds) {
      rounds++;
      view.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise(resolve => view.setTimeout(resolve, wait));
      if (!shouldContinue()) { stopped = true; break; }
      const now = count(); onProgress(now);
      if (now > last) { last = now; still = 0; continue; }
      if (++still >= (more() ? patience * 2 : patience)) break;
    }
    view.scrollTo(0, start);
    return {count: count(), complete: !stopped && !more() && rounds < maxRounds, stopped};
  }

  root.YCGDom = {identity, collect, collectAsync, current, filter, filterAsync, invalidate, loadAll, CARD_SELECTOR};
})(globalThis);
