import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Darwin

// Package the existing mascot on the approved paper color. App Store icons must be opaque.
do {
    guard CommandLine.arguments.count == 3,
          let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[1]) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
          let context = CGContext(data: nil, width: 1024, height: 1024, bitsPerComponent: 8, bytesPerRow: 4096,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
        throw NSError(domain: "OwngameIcon", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cannot read mascot or create icon canvas"])
    }
    context.setFillColor(CGColor(red: 250/255, green: 245/255, blue: 232/255, alpha: 1))
    context.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
    context.draw(image, in: CGRect(x: 36, y: 36, width: 952, height: 952))
    guard let output = context.makeImage(),
          let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: CommandLine.arguments[2]) as CFURL,
            UTType.png.identifier as CFString, 1, nil) else {
        throw NSError(domain: "OwngameIcon", code: 2, userInfo: [NSLocalizedDescriptionKey: "Cannot encode icon"])
    }
    CGImageDestinationAddImage(destination, output, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "OwngameIcon", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot save icon"])
    }
} catch {
    FileHandle.standardError.write(Data((error.localizedDescription + "\n").utf8))
    exit(1)
}
