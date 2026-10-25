/** Browser services are explicit so denied clipboard access and blocked popups can be checked. */
export type ShareServices = {
  copyImage: (blob: Blob) => Promise<void>
  download: (blob: Blob, name: string) => void
  openX: (url: string) => void
}

/** Web intents carry text, not a local image. Prepare the image before opening the composer. */
export async function prepareXShare(blob: Blob, name: string, url: string, services: ShareServices): Promise<'copied' | 'downloaded'> {
  let result: 'copied' | 'downloaded' = 'copied'
  try {
    await services.copyImage(blob)
  } catch {
    services.download(blob, name)
    result = 'downloaded'
  }
  services.openX(url)
  return result
}

export function copyImage(blob: Blob): Promise<void> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return Promise.reject(new Error('image clipboard unavailable'))
  return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
