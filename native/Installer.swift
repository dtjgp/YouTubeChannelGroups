import AppKit
import Foundation

final class InstallerDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    let ids = NSTextField(), status = NSTextField(wrappingLabelWithString: "")
    var browserButtons: [String: NSButton] = [:]

    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 650, height: 480), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "安装 YouTube 分类小助手"
        let container = NSStackView(); container.orientation = .vertical; container.alignment = .leading; container.spacing = 14
        container.translatesAutoresizingMaskIntoConstraints = false
        window.contentView!.addSubview(container)
        NSLayoutConstraint.activate([container.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 28), container.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -28), container.topAnchor.constraint(equalTo: window.contentView!.topAnchor, constant: 28)])
        let title = NSTextField(labelWithString: "一次安装，点击即可调用 AI")
        title.font = .boldSystemFont(ofSize: 23); container.addArrangedSubview(title)
        container.addArrangedSubview(NSTextField(wrappingLabelWithString: "浏览器会按需启动独立小助手。无需打开终端、运行 Python 或保持后台服务。"))
        container.addArrangedSubview(NSTextField(labelWithString: "授权扩展 ID（多个 ID 用逗号分隔）"))
        ids.placeholderString = "从扩展的 AI 设置页复制 32 位扩展 ID"
        ids.stringValue = suggestedIDs().joined(separator: ",")
        ids.setAccessibilityLabel("授权扩展 ID")
        container.addArrangedSubview(ids)
        ids.widthAnchor.constraint(equalTo: container.widthAnchor).isActive = true
        let browsers = NSStackView(); browsers.orientation = .horizontal; browsers.spacing = 18
        for (key, label) in [("chrome", "Chrome"), ("edge", "Edge"), ("brave", "Brave")] {
            let button = NSButton(checkboxWithTitle: label, target: nil, action: nil)
            button.state = key == "chrome" ? .on : .off
            browserButtons[key] = button; browsers.addArrangedSubview(button)
        }
        container.addArrangedSubview(browsers)
        let tools = discoverExecutables()
        container.addArrangedSubview(NSTextField(wrappingLabelWithString: "命令检测：Codex \(tools["codex"] == nil ? "未找到" : "已找到")；Claude \(tools["claude"] == nil ? "未找到" : "已找到")。本程序不会修改登录凭据，也不会在安装时调用模型。"))
        let install = NSButton(title: "安装／更新小助手", target: self, action: #selector(installClicked))
        install.bezelStyle = .rounded; install.keyEquivalent = "\r"; container.addArrangedSubview(install)
        status.textColor = .secondaryLabelColor; container.addArrangedSubview(status)
        container.addArrangedSubview(NSTextField(wrappingLabelWithString: "安装位置：当前用户的 Application Support。不会设置开机启动。安装后在扩展 AI 设置中点击“检测小助手”。"))
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps: true)
    }

    func suggestedIDs() -> [String] {
        var found = Set<String>()
        let home = FileManager.default.homeDirectoryForCurrentUser
        if let previous = try? Configuration.read(from: supportDirectory().appendingPathComponent("config.json")) {
            previous.origins.forEach { found.insert($0.replacingOccurrences(of: "chrome-extension://", with: "").replacingOccurrences(of: "/", with: "")) }
        }
        for directory in browserDirectories.values {
            let root = home.appendingPathComponent("Library/Application Support/" + directory)
            let profiles = ((try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []).filter { $0 == "Default" || $0.hasPrefix("Profile ") }
            for profile in profiles {
                for name in ["Preferences", "Secure Preferences"] {
                    guard let data = try? Data(contentsOf: root.appendingPathComponent(profile + "/" + name)),
                          let preferences = try? object(data), let extensions = preferences["extensions"] as? [String: Any],
                          let settings = extensions["settings"] as? [String: Any] else { continue }
                    for (id, raw) in settings {
                        guard let entry = raw as? [String: Any], let manifest = entry["manifest"] as? [String: Any],
                              let name = manifest["name"] as? String, name == "频道分类 · YouTube Channel Groups", (try? origin(id)) != nil else { continue }
                        found.insert(id)
                    }
                }
            }
        }
        let sibling = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent("extension")
        if FileManager.default.fileExists(atPath: sibling.appendingPathComponent("manifest.json").path) { found.insert(extensionID(for: sibling.path)) }
        if found.isEmpty, let url = Bundle.main.url(forResource: "defaults", withExtension: "json"), let data = try? Data(contentsOf: url),
           let defaults = try? object(data), let path = defaults["extensionPath"] as? String { found.insert(extensionID(for: path)) }
        return found.sorted()
    }
    @objc func installClicked() {
        do {
            guard let binary = Bundle.main.url(forResource: "ycg-native-host", withExtension: nil) else { throw HelperError("安装包缺少小助手程序") }
            let allowed = ids.stringValue.split(whereSeparator: { $0 == "," || $0 == "，" || $0.isWhitespace }).map(String.init)
            let browsers = browserButtons.filter { $0.value.state == .on }.map(\.key)
            _ = try installHelper(source: binary, ids: allowed, browsers: browsers)
            status.textColor = .systemGreen
            status.stringValue = "安装完成。返回扩展 AI 设置，选择 Codex／Claude 并点击“检测小助手”。以后点击生成建议即可自动调用。"
        } catch { status.textColor = .systemRed; status.stringValue = error.localizedDescription }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
}

@main struct InstallerApp {
    static func main() {
        let app = NSApplication.shared
        let delegate = InstallerDelegate()
        app.setActivationPolicy(.regular); app.delegate = delegate
        withExtendedLifetime(delegate) { app.run() }
    }
}
