export type BrowserSupport =
  | { readonly supported: true; readonly browser: 'chrome' | 'edge' }
  | { readonly supported: false; readonly browser: 'firefox' | 'safari' | 'other' };

/** Web MIDI works in Chrome and Edge (D-01). Edge is checked first: its UA also says Chrome. */
export function detectBrowser(userAgent: string): BrowserSupport {
  if (/Edg\//.test(userAgent)) return { supported: true, browser: 'edge' };
  if (/Firefox\//.test(userAgent)) return { supported: false, browser: 'firefox' };
  if (/Chrome\//.test(userAgent) && !/OPR\/|SamsungBrowser/.test(userAgent)) {
    return { supported: true, browser: 'chrome' };
  }
  if (/Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)) {
    return { supported: false, browser: 'safari' };
  }
  return { supported: false, browser: 'other' };
}
