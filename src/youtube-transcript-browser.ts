import { chromium } from 'playwright';
import {
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptError,
  YoutubeTranscriptVideoStatusError,
  YoutubeTranscriptVideoUnavailableError,
} from './youtube-transcript.js';

const selectors = {
  expand: 'tp-yt-paper-button#expand',
  notFound:
    'div.promo-title:has-text("This video isn\'t available anymore"), div.promo-title:has-text("Este video ya no está disponible")',
  showTranscript:
    'button[aria-label="Show transcript"], button[aria-label="Mostrar transcripción"]',
  viewCount: 'yt-formatted-string#info span',
  transcriptSegmentOld: 'ytd-transcript-segment-renderer',
  transcriptSegmentNew: 'transcript-segment-view-model',
  transcriptOld: 'ytd-transcript-renderer',
  transcriptNew: 'ytd-macro-markers-list-renderer[panel-content-visible]',
  textOld: '.segment-text',
  textNew: '.yt-core-attributed-string',
  notify: 'div.ytp-offline-slate-main-text',
};

export class YoutubeTranscriptBrowserError extends YoutubeTranscriptError {
  constructor(message: string) {
    super(message);
  }
}

export async function getTranscript(videoId: string) {
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  const context = browser.contexts()[0];

  const page = await context.newPage();
  try {
    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    const errorElement = await page.$(selectors.notFound);
    if (errorElement) {
      throw new YoutubeTranscriptVideoUnavailableError(videoId);
    }

    const offlineElement = await page.$(selectors.notify);
    if (offlineElement) {
      throw new YoutubeTranscriptVideoStatusError(
        videoId,
        'LIVE_STREAM_OFFLINE',
        ''
      );
    }

    const expandButton = await page.$(selectors.expand);
    if (!expandButton) {
      throw new YoutubeTranscriptBrowserError('Expand button not found');
    }
    await expandButton.click({ timeout: 5000 });

    const showTranscriptButton = await page.$(selectors.showTranscript);
    if (!showTranscriptButton) {
      throw new YoutubeTranscriptDisabledError(videoId);
    }

    await showTranscriptButton.click({ timeout: 5000 });

    let transcript: string[] = [];

    try {
      await page.waitForSelector(selectors.transcriptOld, { timeout: 30000 });
      const oldSegments = await page.$$(selectors.transcriptSegmentOld);
      if (oldSegments.length > 0) {
        transcript = await page.$$eval(
          selectors.transcriptSegmentOld,
          (nodes, textSelector) => {
            return nodes.map(
              n =>
                (
                  n.querySelector(textSelector) as HTMLElement | null
                )?.innerText.trim() ?? ''
            );
          },
          selectors.textOld
        );
      }
    } catch {
      await page.waitForSelector(selectors.transcriptNew, { timeout: 30000 });
      const newSegments = await page.$$(selectors.transcriptSegmentNew);
      if (newSegments.length > 0) {
        transcript = await page.$$eval(
          selectors.transcriptSegmentNew,
          (nodes, textSelector) => {
            return nodes.map(
              n =>
                (
                  n.querySelector(textSelector) as HTMLElement | null
                )?.innerText.trim() ?? ''
            );
          },
          selectors.textNew
        );
      }
    }

    transcript = transcript.filter(t => t.length > 0);

    if (transcript.length === 0) {
      throw new YoutubeTranscriptBrowserError('No transcript segments found');
    }

    /*
    const [viewsText] = await page.$$eval(selectors.viewCount, nodes =>
      nodes.map(n => (n as HTMLElement).innerText.trim())
    );

    const views = parseInt(viewsText.replace(/[^0-9]/g, ''), 10) || 0;
    */
    return transcript.join(' ');
  } catch (error) {
    if (error instanceof YoutubeTranscriptError) {
      throw error;
    }
    throw new YoutubeTranscriptBrowserError(
      `Failed to fetch transcript: ${(error as Error).message}`
    );
  } finally {
    await page.close();
    await browser.close();
  }
}
