import XCTest

final class SmokeTests: XCTestCase {
    @MainActor
    func testBilingualLibraryAndMenus() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.owngame.app")
        for english in [true, false] {
            app.launchArguments = ["-AppleLanguages", english ? "(en)" : "(zh-Hans)", "-AppleLocale", english ? "en_US" : "zh_CN"]
            app.launch()
            let mine = app.webViews.buttons[english ? "My games" : "我的游戏"].firstMatch
            XCTAssertTrue(mine.waitForExistence(timeout: 40), app.debugDescription)
            app.webViews.buttons[english ? "Categories" : "分类"].firstMatch.tap()
            let categoryHeading = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label == %@", english ? "What will you play today?" : "今天想玩什么？")).firstMatch
            XCTAssertTrue(categoryHeading.waitForExistence(timeout: 10), app.debugDescription)
            mine.tap()
            let favorites = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label == %@", english ? "Favorites" : "收藏")).firstMatch
            XCTAssertTrue(favorites.waitForExistence(timeout: 10), app.debugDescription)
            app.webViews.buttons[english ? "Library" : "游戏库"].firstMatch.tap()
            // Filter before tapping so WebKit's offscreen hit-point calculation cannot
            // send a tap below the viewport on a long library page.
            let search = app.webViews.searchFields[english ? "Search games" : "搜索游戏"].firstMatch
            XCTAssertTrue(search.waitForExistence(timeout: 10), app.debugDescription)
            search.tap()
            search.typeText(english ? "Signal Harbor\n" : "潮光归位\n")
            let keyboardHidden = XCTNSPredicateExpectation(predicate: NSPredicate { _,_ in !app.keyboards.firstMatch.exists }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [keyboardHidden], timeout: 10), .completed)
            let play = app.webViews.buttons[english ? "Play Signal Harbor" : "开始游戏：潮光归位"].firstMatch
            if !play.exists {
                let download = app.webViews.buttons[english ? "Download Signal Harbor" : "下载游戏：潮光归位"].firstMatch
                XCTAssertTrue(download.waitForExistence(timeout: 60), app.debugDescription)
                let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: download)
                XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 60), .completed)
                download.tap()
                XCTAssertTrue(play.waitForExistence(timeout: 180), app.debugDescription)
            }
            let library = XCTAttachment(screenshot: app.screenshot()); library.name = english ? "ios-library-en" : "ios-library-zh"; library.lifetime = .keepAlways; add(library)
            play.tap()
            let more = app.buttons[english ? "More game options" : "更多游戏操作"]
            XCTAssertTrue(more.waitForExistence(timeout: 40), app.debugDescription)
            more.tap()
            XCTAssertTrue(app.buttons[english ? "Continue game" : "继续游戏"].waitForExistence(timeout: 15), app.debugDescription)
            XCTAssertTrue(app.buttons[english ? "Game information" : "游戏信息"].exists)
            let menu = XCTAttachment(screenshot: app.screenshot()); menu.name = english ? "ios-menu-en" : "ios-menu-zh"; menu.lifetime = .keepAlways; add(menu)
            app.buttons[english ? "Continue game" : "继续游戏"].tap()
            app.buttons[english ? "Close game and return home" : "关闭游戏，返回首页"].tap()
            XCTAssertTrue(play.waitForExistence(timeout: 15))
            app.terminate()
        }
    }

    @MainActor
    private func openInstalled(_ app: XCUIApplication) {
        let play = app.webViews.buttons["开玩：潮光归位"].firstMatch
        XCTAssertTrue(play.waitForExistence(timeout: 40), app.debugDescription)
        play.tap()
        XCTAssertTrue(app.buttons["更多游戏操作"].waitForExistence(timeout: 40), app.debugDescription)
        XCTAssertTrue(app.webViews.buttons["航图"].firstMatch.waitForExistence(timeout: 40), app.debugDescription)
    }

    @MainActor
    func testFullscreenCapsuleAndOrientation() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.owngame.app")
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        app.launch()
        openInstalled(app)
        let game = app.webViews.firstMatch
        XCTAssertEqual(game.frame.minY, app.frame.minY, accuracy: 1)
        XCTAssertEqual(game.frame.maxY, app.frame.maxY, accuracy: 1)
        XCTAssertFalse(app.staticTexts["game-orientation-hint"].exists)
        let oneMove = app.webViews.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "1 步 · 目标 3 步")).firstMatch
        XCTAssertTrue(oneMove.exists)
        app.buttons["更多游戏操作"].tap()
        XCTAssertTrue(app.buttons["继续游戏"].waitForExistence(timeout: 10))
        app.buttons["继续游戏"].tap()
        XCTAssertTrue(oneMove.waitForExistence(timeout: 10))
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertTrue(app.staticTexts["game-orientation-hint"].waitForExistence(timeout: 10))
        let landscape = XCTAttachment(screenshot: app.screenshot()); landscape.name = "iphone-landscape-hint"; landscape.lifetime = .keepAlways; add(landscape)
        XCUIDevice.shared.orientation = .portrait
        let portrait = XCTNSPredicateExpectation(predicate: NSPredicate { _,_ in !app.staticTexts["game-orientation-hint"].exists && app.frame.height > app.frame.width }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [portrait], timeout: 10), .completed)
        app.buttons["关闭游戏，返回首页"].tap()
        XCTAssertTrue(app.webViews.buttons["开玩：潮光归位"].firstMatch.waitForExistence(timeout: 15))
        openInstalled(app)
        XCTAssertTrue(oneMove.waitForExistence(timeout: 10))
        let screenshot = XCTAttachment(screenshot: app.screenshot()); screenshot.name = "iphone-fullscreen-capsule"; screenshot.lifetime = .keepAlways; add(screenshot)
    }

    @MainActor
    func testInstalledMoveAndRelaunch() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.owngame.app")
        app.launch()
        // The caller applies a real device network condition, never a mocked transport.
        if ProcessInfo.processInfo.environment["OWNGAME_EXPECT_OFFLINE"] == "1" {
            let failure = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "操作未完成")).firstMatch
            XCTAssertTrue(failure.waitForExistence(timeout: 45), app.debugDescription)
        }
        openInstalled(app)
        let oneMove = app.webViews.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "1 步 · 目标 3 步")).firstMatch
        if !oneMove.exists {
            let coral = app.webViews.switches["珊瑚塔，2 / 2 盏，顶灯珊瑚"].firstMatch
            // Selecting a source changes the destination's accessibility role.
            let harbor = app.webViews.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "临时泊位，0 / 2 盏")).firstMatch
            try XCTSkipUnless(coral.exists && harbor.exists, "This test requires the untouched first tutorial; it does not reset existing saves.")
            coral.tap(); harbor.tap()
        }
        XCTAssertTrue(oneMove.waitForExistence(timeout: 15), app.debugDescription)
        app.terminate()
        app.launch()
        openInstalled(app)
        XCTAssertTrue(oneMove.waitForExistence(timeout: 15), app.debugDescription)
        XCTAssertTrue(app.webViews.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "珊瑚塔，1 / 2 盏")).firstMatch.exists)
        XCTAssertTrue(app.webViews.switches.matching(NSPredicate(format: "label BEGINSWITH %@", "临时泊位，1 / 2 盏")).firstMatch.exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "device-game-save-after-relaunch"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    @MainActor
    func testDownloadAndOpen() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "dev.owngame.app")
        app.launch()
        let play = app.webViews.buttons["开玩：潮光归位"].firstMatch
        for _ in 0..<3 where !play.exists {
            let download = app.webViews.buttons["下载：潮光归位"].firstMatch
            XCTAssertTrue(download.waitForExistence(timeout: 40), app.debugDescription)
            let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: download)
            XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 40), .completed, app.debugDescription)
            download.tap()
            let failed = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "下载未完成")).firstMatch
            let finished = XCTNSPredicateExpectation(predicate: NSPredicate { _,_ in play.exists || failed.exists }, object: nil)
            XCTAssertEqual(XCTWaiter.wait(for: [finished], timeout: 300), .completed, app.debugDescription)
        }
        XCTAssertTrue(play.exists, app.debugDescription)
        play.tap()
        XCTAssertTrue(app.buttons["更多游戏操作"].waitForExistence(timeout: 40), app.debugDescription)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "device-game-open"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        print("OWNGAME_GAME_HIERARCHY\n" + app.debugDescription)
    }
}
