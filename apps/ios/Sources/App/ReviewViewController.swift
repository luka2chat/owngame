import UIKit

final class ReviewViewController: UIViewController {
    private let game: CatalogGame
    private let art = UISegmentedControl(items: ["1", "2", "3", "4", "5"])
    private let feel = UISegmentedControl(items: ["1", "2", "3", "4", "5"])
    private let note = UITextView()
    init(game: CatalogGame) { self.game = game; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }
    override func viewDidLoad() {
        super.viewDidLoad(); title = AppText.text("试玩评价"); view.backgroundColor = Brand.paper
        navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .cancel, target: self, action: #selector(cancel))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: AppText.text("保存"), style: .done, target: self, action: #selector(save))
        let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 16; stack.translatesAutoresizingMaskIntoConstraints = false
        func label(_ text: String) -> UILabel { let label = UILabel(); label.text = text; label.numberOfLines = 0; return label }
        [label(AppText.title(game.id, game.title)), label(AppText.text("美术表现（1 至 5 星）")), art, label(AppText.text("操作手感（1 至 5 星）")), feel,
         label(AppText.text("写下一句感受。评价仅保存在本机。")), note].forEach(stack.addArrangedSubview)
        art.accessibilityLabel = AppText.text("美术评分"); feel.accessibilityLabel = AppText.text("手感评分"); note.accessibilityLabel = AppText.text("评价内容")
        note.font = .systemFont(ofSize: 17); note.layer.borderWidth = 1; note.layer.cornerRadius = 8
        note.heightAnchor.constraint(equalToConstant: 140).isActive = true
        view.addSubview(stack)
        NSLayoutConstraint.activate([stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24),
            stack.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -24)])
    }
    @objc private func cancel() { dismiss(animated: true) }
    @objc private func save() {
        let text = note.text.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            try GamePaths.require(art.selectedSegmentIndex >= 0 && feel.selectedSegmentIndex >= 0 && !text.isEmpty && text.count <= 4000, AppText.text("请给出两项评分，并填写 1 至 4000 字的感受"))
            let record: [String: Any] = ["delivery_id": game.id, "build_sha256": game.version, "reviewer": "human",
                "art": art.selectedSegmentIndex + 1, "feel": feel.selectedSegmentIndex + 1, "note": text,
                "created_at": ISO8601DateFormatter().string(from: Date())]
            let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true).appendingPathComponent("Owngame/reviews")
            try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
            try JSONSerialization.data(withJSONObject: record).write(to: base.appendingPathComponent(UUID().uuidString + ".json"), options: .atomic)
            dismiss(animated: true)
        } catch {
            let alert = UIAlertController(title: AppText.text("尚未保存"), message: error.localizedDescription, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: AppText.text("继续填写"), style: .default)); present(alert, animated: true)
        }
    }
}
