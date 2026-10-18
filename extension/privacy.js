/* Deletion keeps only an anonymous tombstone to reject old writes and pause collection. */
(function (root) {
  "use strict";
  const KEY = "ycg.privacy.v1";
  function normalize(value) { return {epoch: typeof value?.epoch === "string" ? value.epoch : null, collectionPaused: value?.collectionPaused === true}; }
  function assertCurrent(privacy, epoch) {
    if (privacy.epoch !== (epoch ?? null)) throw new Error("数据已删除，旧操作已取消；请重新开始");
  }
  function optionalOrigins(granted, manifest) {
    const required = new Set([...(manifest.host_permissions || []), ...(manifest.content_scripts || []).flatMap(script => script.matches)]);
    return (granted.origins || []).filter(origin => !required.has(origin));
  }
  async function revoke(permissions, manifest) {
    const origins = optionalOrigins(await permissions.getAll(), manifest);
    if (origins.length) await permissions.remove({origins});
    const remaining = optionalOrigins(await permissions.getAll(), manifest);
    return {revoked: origins.length - remaining.length, remaining};
  }
  async function erase(storage, permissions, manifest, epoch) {
    const privacy = {epoch, collectionPaused: true};
    // Write the tombstone first. Concurrent old tabs must not resurrect cleared state.
    await storage.set({[KEY]: privacy});
    const stored = await storage.get(null);
    const keys = Object.keys(stored).filter(key => key !== KEY);
    if (keys.length) await storage.remove(keys);
    let permissionResult;
    try { permissionResult = await revoke(permissions, manifest); }
    catch { permissionResult = {revoked: 0, remaining: ["retry"]}; }
    return {privacy, ...permissionResult};
  }
  root.YCGPrivacy = {KEY, normalize, assertCurrent, optionalOrigins, revoke, erase};
  if (typeof module !== "undefined") module.exports = root.YCGPrivacy;
})(globalThis);
