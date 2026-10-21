import Foundation
import Network

// All listener state and connection mutations are confined to queue.
final class LocalGameServer: @unchecked Sendable {
    private let queue = DispatchQueue(label: "dev.owngame.game-server")
    private var listener: NWListener?
    private var connections = [UUID: NWConnection]()
    private var pending: CheckedContinuation<Void, Error>?
    func start(root: URL, files: [GameFile], port: UInt16) async throws {
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: .ipv4(.loopback), port: NWEndpoint.Port(rawValue: port)!)
        parameters.allowLocalEndpointReuse = true
        let listener = try NWListener(using: parameters)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            queue.async { [self] in
                self.listener = listener
                self.pending = continuation
                listener.stateUpdateHandler = { [weak self] state in
                    guard let self else { return }
                    switch state {
                    case .ready: self.pending?.resume(); self.pending = nil
                    case .failed(let error): self.pending?.resume(throwing: error); self.pending = nil; self.listener?.cancel()
                    case .cancelled: self.pending?.resume(throwing: CancellationError()); self.pending = nil
                    default: break
                    }
                }
                listener.newConnectionHandler = { [weak self] connection in
                    guard let self else { connection.cancel(); return }
                    guard self.connections.count < 24 else { connection.cancel(); return }
                    let id = UUID(); self.connections[id] = connection
                    connection.stateUpdateHandler = { [weak self] state in
                        switch state {
                        case .cancelled, .failed: self?.connections.removeValue(forKey: id)
                        default: break
                        }
                    }
                    connection.start(queue: self.queue)
                    self.receive(connection, buffer: Data(), root: root, files: files, port: port)
                    self.queue.asyncAfter(deadline: .now() + 15) { [weak connection] in connection?.cancel() }
                }
                listener.start(queue: self.queue)
            }
        }
    }
    private func receive(_ connection: NWConnection, buffer: Data, root: URL, files: [GameFile], port: UInt16) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            let request = buffer + (data ?? Data())
            if request.count > 16384 { connection.cancel(); return }
            if request.range(of: Data("\r\n\r\n".utf8)) != nil {
                let response = GameHTTP.response(request, root: root, files: files, port: port)
                connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
            } else if complete || error != nil { connection.cancel() }
            else { self.receive(connection, buffer: request, root: root, files: files, port: port) }
        }
    }
    func stop() {
        queue.async {
            self.listener?.cancel(); self.listener = nil
            for connection in self.connections.values { connection.cancel() }
            self.connections.removeAll()
        }
    }
}
