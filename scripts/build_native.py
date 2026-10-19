"""Build standalone macOS binaries and a GUI installer. Development use only."""
from pathlib import Path
import plistlib
import platform
import subprocess

root = Path(__file__).resolve().parents[1]
build = root / "artifacts/native"
build.mkdir(parents=True, exist_ok=True)
architecture = "arm64" if platform.machine() == "arm64" else "x86_64"
target = f"{architecture}-apple-macosx13.0"
host = build / "ycg-native-host"
app = root / "artifacts/安装YouTube分类小助手.app"
contents = app / "Contents"
for directory in [contents / "MacOS", contents / "Resources"]:
    directory.mkdir(parents=True, exist_ok=True)
common = ["swiftc", "-swift-version", "5", "-O", "-target", target, "native/Core.swift"]
subprocess.run([*common, "native/Host.swift", "-o", str(host)], cwd=root, check=True)
subprocess.run([*common, "native/Installer.swift", "-o", str(contents / "MacOS/Installer")], cwd=root, check=True)
(contents / "Resources/ycg-native-host").write_bytes(host.read_bytes())
(contents / "Resources/ycg-native-host").chmod(0o755)
# Older builds stored the build machine's extension path here; the installer now finds it relative to the bundle.
(contents / "Resources/defaults.json").unlink(missing_ok=True)
(contents / "Info.plist").write_bytes(plistlib.dumps({
    "CFBundleExecutable": "Installer", "CFBundleIdentifier": "com.dtjgp.youtube-channel-groups.installer",
    "CFBundleName": "YouTube 分类小助手安装器", "CFBundlePackageType": "APPL",
    "CFBundleShortVersionString": "0.3.0", "CFBundleVersion": "3", "LSMinimumSystemVersion": "13.0",
    "NSHighResolutionCapable": True,
}))
subprocess.run(["codesign", "--force", "--sign", "-", str(host)], check=True, capture_output=True)
# Copy the signed host, then sign the complete local installer bundle.
(contents / "Resources/ycg-native-host").write_bytes(host.read_bytes())
subprocess.run(["codesign", "--force", "--deep", "--sign", "-", str(app)], check=True, capture_output=True)
print(f"Built standalone {architecture} helper and installer: {app}")
