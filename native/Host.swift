import Foundation
import Darwin

final class NativeServer {
    private let outputLock = NSLock(), runLock = NSLock()
    private var active: RunControl?
    private let config: Configuration
    init(_ config: Configuration) { self.config = config }
    func send(_ value: [String: Any]) {
        guard let payload = try? jsonData(value), payload.count <= 1000000 else { return }
        var length = UInt32(payload.count).littleEndian
        outputLock.lock(); defer { outputLock.unlock() }
        do {
            try FileHandle.standardOutput.write(contentsOf: Data(bytes: &length, count: 4))
            try FileHandle.standardOutput.write(contentsOf: payload)
        } catch { cancel() }
    }
    func cancel() { runLock.lock(); let running = active; runLock.unlock(); running?.cancel() }
    func handle(_ message: [String: Any]) {
        if message["action"] as? String == "status" {
            send(["ok": true, "version": helperVersion, "providers": ["codex", "claude"].filter { config.executables[$0].map { FileManager.default.isExecutableFile(atPath: $0) } == true }])
            return
        }
        guard message["action"] as? String == "classify" else { send(["ok": false, "error": "不支持的本机操作"]); return }
        do {
            let request = try validatedRequest(message)
            runLock.lock()
            if active != nil { runLock.unlock(); send(["ok": false, "error": "已有本机 AI 任务运行"]); return }
            let control = RunControl(); active = control; runLock.unlock()
            DispatchQueue.global().async {
                let response: [String: Any]
                do { response = ["ok": true, "result": try runClassification(request, config: self.config, control: control, timeout: self.config.timeout)] }
                catch let error as HelperError { response = ["ok": false, "error": error.message] }
                catch { response = ["ok": false, "error": "本机 AI 返回异常，请检查 CLI 版本和登录状态"] }
                self.runLock.lock(); self.active = nil; self.runLock.unlock()
                self.send(response)
            }
        } catch let error as HelperError { send(["ok": false, "error": error.message]) }
        catch { send(["ok": false, "error": "分类请求无效"]) }
    }
}
func readExactly(_ count: Int) throws -> Data? {
    var data = Data()
    while data.count < count {
        guard let chunk = try FileHandle.standardInput.read(upToCount: count - data.count), !chunk.isEmpty else {
            if data.isEmpty { return nil }
            throw HelperError("消息长度不完整")
        }
        data.append(chunk)
    }
    return data
}

@main struct NativeHost {
    static func main() {
        signal(SIGPIPE, SIG_IGN)
        let args = Array(CommandLine.arguments.dropFirst())
        do {
            // This installation path is used by the GUI installer and automated tests.
            if args.first == "--install" {
                func option(_ key: String) -> String? { guard let index = args.firstIndex(of: key), index + 1 < args.count else { return nil }; return args[index + 1] }
                guard let ids = option("--extension-ids") else { throw HelperError("缺少扩展 ID") }
                let home = option("--home").map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser
                let paths = try installHelper(source: URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL, ids: ids.split(separator: ",").map(String.init), browsers: (option("--browsers") ?? "chrome").split(separator: ",").map(String.init), home: home)
                print(String(data: try jsonData(["ok": true, "registered": paths]), encoding: .utf8)!)
                return
            }
            let configURL = ProcessInfo.processInfo.environment["YCG_NATIVE_CONFIG"].map { URL(fileURLWithPath: $0) } ?? supportDirectory().appendingPathComponent("config.json")
            let config = try Configuration.read(from: configURL)
            guard let calling = args.first else { throw HelperError("只允许浏览器启动小助手") }
            let normalized = calling.hasSuffix("/") ? calling : calling + "/"
            try check(config.origins.contains(normalized), "扩展来源未授权，请重新安装小助手")
            removeStaleTemporaryDirectories()
            let server = NativeServer(config)
            defer { server.cancel() }
            while let header = try readExactly(4) {
                let length = header.enumerated().reduce(UInt32(0)) { $0 | UInt32($1.element) << UInt32($1.offset * 8) }
                try check(length > 0 && length <= 100000, "消息超出大小限制")
                guard let payload = try readExactly(Int(length)) else { throw HelperError("消息不完整") }
                server.handle(try object(payload))
            }
        } catch {
            // Native stdout is reserved for framed JSON. No credential or raw CLI logs.
            FileHandle.standardError.write(Data("YouTube 分类助手启动失败，请检查安装和扩展授权。\n".utf8))
            exit(1)
        }
    }
}
