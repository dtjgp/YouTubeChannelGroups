"""Package the runtime files without test dependencies or local browser data."""

import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
runtime = root / "extension"
manifest = json.loads((runtime / "manifest.json").read_text())
assert json.loads((root / "package.json").read_text())["version"] == manifest["version"]
lock = json.loads((root / "package-lock.json").read_text())
assert lock["version"] == lock["packages"][""]["version"] == manifest["version"]
files = {"design.js", "work.js", "privacy.js", "manifest.json", "background.js", "core.js", "ai.js", "i18n.js", "export.js", "theme.js", "layout.js", "dom.js", "unsubscribe.js", "styles.js", "review-ui.js", "organizer-ui.js", "assistant-ui.js", "options.html", "options.js", "options.css", "content.js", *manifest["icons"].values()}
references = {
    manifest["background"]["service_worker"],
    *(name for script in manifest["content_scripts"] for name in script["js"]),
    manifest["options_ui"]["page"],
}
assert references <= files
assert set(manifest["action"]["default_icon"].values()) <= files
assert manifest["web_accessible_resources"] == [{"resources": ["icons/icon48.png"], "matches": ["https://www.youtube.com/*"]}]
assert manifest["permissions"] == ["storage", "nativeMessaging"]
assert not manifest.get("host_permissions")
assert manifest["optional_host_permissions"] == ["https://*/*", "http://127.0.0.1/*", "http://localhost/*"]
assert manifest["content_scripts"][0]["matches"] == ["https://www.youtube.com/*"]
for name in files:
    assert (runtime / name).is_file(), name
for size, name in manifest["icons"].items():
    header = (runtime / name).read_bytes()
    assert header[:8] == b"\x89PNG\r\n\x1a\n"
    assert int.from_bytes(header[16:20], "big") == int(size)
    assert int.from_bytes(header[20:24], "big") == int(size)

output = root / "artifacts" / f"youtube-channel-groups-v{manifest['version']}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in sorted(files):
        archive.write(runtime / name, f"YouTubeChannelGroups/extension/{name}")
    archive.write(root / "README.md", "YouTubeChannelGroups/README.md")
    app = root / "artifacts/安装YouTube分类小助手.app"
    assert (app / "Contents/MacOS/Installer").is_file(), "Run npm run build:native first"
    app_files = [path for path in app.rglob("*") if path.is_file()]
    for path in app_files:
        archive.write(path, "YouTubeChannelGroups/" + str(path.relative_to(app.parent)))
with ZipFile(output) as archive:
    assert archive.testzip() is None
    for name in files:
        assert archive.read(f"YouTubeChannelGroups/extension/{name}") == (runtime / name).read_bytes()
    assert archive.read("YouTubeChannelGroups/README.md") == (root / "README.md").read_bytes()
    for path in app_files:
        assert archive.read("YouTubeChannelGroups/" + str(path.relative_to(app.parent))) == path.read_bytes()
    assert len(archive.namelist()) == len(files) + 1 + len(app_files)
    assert not any(name.endswith(".py") for name in archive.namelist())
    helper = next(item for item in archive.infolist() if item.filename.endswith("Resources/ycg-native-host"))
    assert (helper.external_attr >> 16) & 0o111
print(f"Verified package: {output} ({output.stat().st_size} bytes)")
