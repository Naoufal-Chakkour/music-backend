const express = require('express');
const axios = require('axios');
const archiver = require('archiver');
const dns = require('dns').promises;
const net = require('net');

const {
  searchAllSources
} = require('../services/musicSources');

const router = express.Router();

/*
|--------------------------------------------------------------------------
| Limits
|--------------------------------------------------------------------------
*/

const MAX_TRACKS_PER_DOWNLOAD = 50;

const MAX_FILE_SIZE =
  100 * 1024 * 1024;

const DOWNLOAD_TIMEOUT =
  30000;

const CHECK_TIMEOUT =
  10000;

const MAX_REDIRECTS =
  5;

/*
|--------------------------------------------------------------------------
| Supported providers
|--------------------------------------------------------------------------
*/

const ALLOWED_PROVIDERS = new Set([
  'Jamendo',
  'Audius',
  'ccMixter',
  'FMA',
  'Internet Archive',
  'Musopen',
  'Openverse',
  'Wikimedia Commons',
  'SoundCloud'
]);

/*
|--------------------------------------------------------------------------
| Trusted hosts
|--------------------------------------------------------------------------
*/

const EXACT_ALLOWED_HOSTS = new Set([
  'api.jamendo.com',

  'discoveryprovider.audius.co',

  'ccmixter.org',
  'www.ccmixter.org',

  'freemusicarchive.org',
  'www.freemusicarchive.org',

  'archive.org',
  'www.archive.org',

  'musopen.org',
  'www.musopen.org',

  'api.openverse.org',

  'commons.wikimedia.org',
  'upload.wikimedia.org'
]);

/*
|--------------------------------------------------------------------------
| IP security
|--------------------------------------------------------------------------
*/

function isPrivateOrLocalIp(ip) {
  const version =
    net.isIP(ip);

  if (!version) {
    return true;
  }

  if (version === 4) {
    const parts =
      ip.split('.').map(Number);

    const [a, b] =
      parts;

    if (a === 0) {
      return true;
    }

    if (a === 10) {
      return true;
    }

    if (a === 127) {
      return true;
    }

    if (
      a === 169 &&
      b === 254
    ) {
      return true;
    }

    if (
      a === 172 &&
      b >= 16 &&
      b <= 31
    ) {
      return true;
    }

    if (
      a === 192 &&
      b === 168
    ) {
      return true;
    }

    if (
      a === 100 &&
      b >= 64 &&
      b <= 127
    ) {
      return true;
    }

    if (
      a === 198 &&
      (
        parts[2] === 18 ||
        parts[2] === 19
      )
    ) {
      return true;
    }

    return false;
  }

  const normalized =
    ip.toLowerCase();

  if (
    normalized === '::' ||
    normalized === '::1'
  ) {
    return true;
  }

  if (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true;
  }

  if (
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| DNS security
|--------------------------------------------------------------------------
*/

async function resolvesToPublicIp(
  hostname
) {
  try {
    const addresses =
      await dns.lookup(
        hostname,
        {
          all: true,
          verbatim: true
        }
      );

    if (
      !addresses.length
    ) {
      return false;
    }

    return addresses.every(
      address =>
        !isPrivateOrLocalIp(
          address.address
        )
    );

  } catch (err) {
    console.warn(
      `[security] DNS lookup failed for ${hostname}:`,
      err.message
    );

    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Remote URL validation
|--------------------------------------------------------------------------
*/

async function isAllowedRemoteUrl(
  value,
  sourceProvider
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return false;
  }

  if (
    !ALLOWED_PROVIDERS.has(
      sourceProvider
    )
  ) {
    return false;
  }

  let url;

  try {
    url =
      new URL(value);

  } catch {
    return false;
  }

  if (
    url.protocol !== 'https:'
  ) {
    return false;
  }

  const hostname =
    url.hostname.toLowerCase();

  /*
   * Direct IP address.
   */

  if (
    net.isIP(hostname)
  ) {
    return !isPrivateOrLocalIp(
      hostname
    );
  }

  /*
   * Trusted hosts.
   */

  if (
    EXACT_ALLOWED_HOSTS.has(
      hostname
    )
  ) {
    return true;
  }

  /*
   * Internet Archive download servers.
   */

  if (
    sourceProvider ===
      'Internet Archive' &&
    /^ia\d+\.us\.archive\.org$/i.test(
      hostname
    )
  ) {
    return resolvesToPublicIp(
      hostname
    );
  }

  /*
   * Openverse external media.
   */

  if (
    sourceProvider ===
      'Openverse'
  ) {
    return resolvesToPublicIp(
      hostname
    );
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Redirect validation
|--------------------------------------------------------------------------
*/

async function isAllowedRedirect(
  value,
  sourceProvider
) {
  return isAllowedRemoteUrl(
    value,
    sourceProvider
  );
}

/*
|--------------------------------------------------------------------------
| Filename security
|--------------------------------------------------------------------------
*/

function sanitizeFilename(
  name
) {
  let filename =
    String(
      name || 'track'
    )
      .replace(
        /[\\/:*?"<>|]/g,
        '_'
      )
      .replace(
        /[\u0000-\u001F\u007F]/g,
        ''
      )
      .trim();

  if (!filename) {
    filename =
      'track';
  }

  filename =
    filename.replace(
      /^\.+$/,
      'track'
    );

  return filename.substring(
    0,
    180
  );
}

/*
|--------------------------------------------------------------------------
| Content-Type → extension
|--------------------------------------------------------------------------
*/

function extensionFromContentType(
  contentType
) {
  if (!contentType) {
    return null;
  }

  const type =
    contentType
      .split(';')[0]
      .trim()
      .toLowerCase();

  const extensions = {
    'audio/mpeg':
      '.mp3',

    'audio/mp3':
      '.mp3',

    'audio/ogg':
      '.ogg',

    'application/ogg':
      '.ogg',

    'audio/opus':
      '.opus',

    'audio/wav':
      '.wav',

    'audio/x-wav':
      '.wav',

    'audio/flac':
      '.flac',

    'audio/x-flac':
      '.flac',

    'audio/mp4':
      '.m4a',

    'audio/x-m4a':
      '.m4a',

    'audio/aac':
      '.aac',

    'audio/webm':
      '.webm'
  };

  return (
    extensions[type] ||
    null
  );
}

/*
|--------------------------------------------------------------------------
| Audio Content-Type validation
|--------------------------------------------------------------------------
*/

function isAudioContentType(
  contentType
) {
  if (!contentType) {
    return false;
  }

  const type =
    contentType
      .split(';')[0]
      .trim()
      .toLowerCase();

  return (
    type.startsWith(
      'audio/'
    ) ||
    type ===
      'application/ogg'
  );
}

/*
|--------------------------------------------------------------------------
| Detect audio extension from URL
|--------------------------------------------------------------------------
*/

function urlLooksLikeAudio(
  value
) {
  try {
    const url =
      new URL(value);

    const pathname =
      url.pathname
        .toLowerCase();

    return (
      /\.(mp3|m4a|flac|wav|ogg|oga|opus|aac|webm)$/i
        .test(pathname)
    );

  } catch {
    return false;
  }
}

/*
|--------------------------------------------------------------------------
| Check whether response is downloadable audio
|--------------------------------------------------------------------------
*/

function isDownloadableAudioResponse(
  contentType,
  url
) {
  if (
    isAudioContentType(
      contentType
    )
  ) {
    return true;
  }

  /*
   * Some legitimate audio
   * servers return octet-stream.
   *
   * In that case only accept it
   * when the URL itself clearly
   * identifies an audio file.
   */

  const type =
    String(
      contentType || ''
    )
      .split(';')[0]
      .trim()
      .toLowerCase();

  if (
    (
      type ===
        'application/octet-stream' ||
      type === ''
    ) &&
    urlLooksLikeAudio(url)
  ) {
    return true;
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| Unique filename
|--------------------------------------------------------------------------
*/

function createUniqueFilename(
  baseName,
  extension,
  usedNames
) {
  let filename =
    `${baseName}${extension}`;

  let counter =
    2;

  while (
    usedNames.has(
      filename.toLowerCase()
    )
  ) {
    filename =
      `${baseName} (${counter})${extension}`;

    counter++;
  }

  usedNames.add(
    filename.toLowerCase()
  );

  return filename;
}

/*
|--------------------------------------------------------------------------
| Resolve URL safely
|--------------------------------------------------------------------------
|
| Used by the pre-download checker.
|
| IMPORTANT:
| We request only a tiny Range when possible.
| We do NOT download the complete file.
|
*/

async function resolveCheckUrl(
  initialUrl,
  sourceProvider
) {
  let currentUrl =
    initialUrl;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount++
  ) {
    const allowed =
      await isAllowedRemoteUrl(
        currentUrl,
        sourceProvider
      );

    if (!allowed) {
      throw new Error(
        `Blocked remote URL: ${currentUrl}`
      );
    }

    let response;

    try {
      response =
        await axios.get(
          currentUrl,
          {
            responseType:
              'stream',

            timeout:
              CHECK_TIMEOUT,

            maxRedirects:
              0,

            validateStatus:
              status =>
                status >= 200 &&
                status < 400,

            headers: {
              'User-Agent':
                'MusicVault/3.0',

              'Accept':
                'audio/*,*/*;q=0.8',

              'Range':
                'bytes=0-0'
            }
          }
        );

    } catch (err) {
      throw err;
    }

    /*
     * 2xx
     */

    if (
      response.status >= 200 &&
      response.status < 300
    ) {
      return {
        url:
          currentUrl,

        response
      };
    }

    /*
     * 3xx
     */

    if (
      response.status >= 300 &&
      response.status < 400
    ) {
      if (
        response.data &&
        typeof response.data.destroy ===
          'function'
      ) {
        response.data.destroy();
      }

      const location =
        response.headers.location;

      if (!location) {
        throw new Error(
          `Redirect without Location header (${response.status})`
        );
      }

      const nextUrl =
        new URL(
          location,
          currentUrl
        ).toString();

      const allowedRedirect =
        await isAllowedRedirect(
          nextUrl,
          sourceProvider
        );

      if (!allowedRedirect) {
        throw new Error(
          `Blocked redirect destination: ${nextUrl}`
        );
      }

      console.log(
        `[check-download] redirect ${response.status}: ${currentUrl} -> ${nextUrl}`
      );

      currentUrl =
        nextUrl;

      continue;
    }

    throw new Error(
      `Unexpected HTTP status ${response.status}`
    );
  }

  throw new Error(
    `Too many redirects (>${MAX_REDIRECTS})`
  );
}

/*
|--------------------------------------------------------------------------
| CHECK DOWNLOAD
|--------------------------------------------------------------------------
*/

async function checkDownloadAvailability(
  url,
  sourceProvider
) {
  try {
    const result =
      await resolveCheckUrl(
        url,
        sourceProvider
      );

    const response =
      result.response;

    const contentType =
      response.headers[
        'content-type'
      ] || '';

    const contentLengthHeader =
      response.headers[
        'content-length'
      ];

    const contentLength =
      Number(
        contentLengthHeader || 0
      );

    /*
     * Close the stream immediately.
     *
     * We don't want to download
     * the entire song during checking.
     */

    if (
      response.data &&
      typeof response.data.destroy ===
        'function'
    ) {
      response.data.destroy();
    }

    /*
     * Verify that the destination
     * is actually audio/downloadable.
     */

    const downloadable =
      isDownloadableAudioResponse(
        contentType,
        result.url
      );

    if (!downloadable) {
      return {
        available:
          false,

        reason:
          `رابط التنزيل لا يعيد ملفًا صوتيًا (${contentType || 'unknown'})`
      };
    }

    /*
     * Check known content length.
     */

    if (
      contentLength &&
      (
        !Number.isFinite(
          contentLength
        ) ||
        contentLength <= 0 ||
        contentLength >
          MAX_FILE_SIZE
      )
    ) {
      return {
        available:
          false,

        reason:
          'حجم الملف غير صالح أو أكبر من الحد المسموح'
      };
    }

    return {
      available:
        true,

      finalUrl:
        result.url,

      contentType
    };

  } catch (err) {
    const status =
      err.response?.status;

    return {
      available:
        false,

      reason:
        status
          ? `HTTP ${status}`
          : err.message
    };
  }
}

/*
|--------------------------------------------------------------------------
| DOWNLOAD AUDIO
|--------------------------------------------------------------------------
*/

async function downloadAudio(
  initialUrl,
  sourceProvider
) {
  let currentUrl =
    initialUrl;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount++
  ) {
    const allowed =
      await isAllowedRemoteUrl(
        currentUrl,
        sourceProvider
      );

    if (!allowed) {
      throw new Error(
        `Blocked remote URL: ${currentUrl}`
      );
    }

    let response;

    try {
      response =
        await axios.get(
          currentUrl,
          {
            responseType:
              'arraybuffer',

            timeout:
              DOWNLOAD_TIMEOUT,

            maxContentLength:
              MAX_FILE_SIZE,

            maxBodyLength:
              MAX_FILE_SIZE,

            maxRedirects:
              0,

            validateStatus:
              status =>
                status >= 200 &&
                status < 400,

            headers: {
              'User-Agent':
                'MusicVault/3.0',

              'Accept':
                'audio/*,*/*;q=0.8'
            }
          }
        );

    } catch (err) {
      throw err;
    }

    /*
     * 2xx
     */

    if (
      response.status >= 200 &&
      response.status < 300
    ) {
      return response;
    }

    /*
     * 3xx
     */

    if (
      response.status >= 300 &&
      response.status < 400
    ) {
      const location =
        response.headers.location;

      if (!location) {
        throw new Error(
          `Redirect without Location header (${response.status})`
        );
      }

      const nextUrl =
        new URL(
          location,
          currentUrl
        ).toString();

      const allowedRedirect =
        await isAllowedRedirect(
          nextUrl,
          sourceProvider
        );

      if (!allowedRedirect) {
        throw new Error(
          `Blocked redirect destination: ${nextUrl}`
        );
      }

      console.log(
        `[download] redirect ${response.status}: ${currentUrl} -> ${nextUrl}`
      );

      currentUrl =
        nextUrl;

      continue;
    }

    throw new Error(
      `Unexpected HTTP status ${response.status}`
    );
  }

  throw new Error(
    `Too many redirects (>${MAX_REDIRECTS})`
  );
}

/*
|--------------------------------------------------------------------------
| GET /api/search
|--------------------------------------------------------------------------
*/

router.get(
  '/search',
  async (req, res) => {
    const artist =
      String(
        req.query.artist || ''
      ).trim();

    if (!artist) {
      return res.status(400).json({
        error:
          'الرجاء إرسال اسم الفنان عبر ?artist='
      });
    }

    if (
      artist.length > 200
    ) {
      return res.status(400).json({
        error:
          'عبارة البحث طويلة جدًا'
      });
    }

    try {
      const results =
        await searchAllSources(
          artist
        );

      return res.status(200).json({
        count:
          results.length,

        results
      });

    } catch (err) {
      console.error(
        '[search] error:',
        err
      );

      return res.status(500).json({
        error:
          'حدث خطأ أثناء البحث'
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET /api/check-download
|--------------------------------------------------------------------------
*/

router.get(
  '/check-download',
  async (req, res) => {
    const url =
      String(
        req.query.url || ''
      ).trim();

    const provider =
      String(
        req.query.provider || ''
      ).trim();

    if (!url) {
      return res.status(400).json({
        available:
          false,

        error:
          'رابط التنزيل مفقود'
      });
    }

    if (!provider) {
      return res.status(400).json({
        available:
          false,

        error:
          'المصدر مفقود'
      });
    }

    const allowed =
      await isAllowedRemoteUrl(
        url,
        provider
      );

    if (!allowed) {
      return res.status(403).json({
        available:
          false,

        error:
          'رابط غير مسموح'
      });
    }

    const result =
      await checkDownloadAvailability(
        url,
        provider
      );

    if (
      !result.available
    ) {
      console.warn(
        `[check-download] unavailable [${provider}]: ${url} -> ${result.reason}`
      );

      return res.status(200).json({
        available:
          false,

        reason:
          result.reason ||
          'الملف غير قابل للتنزيل'
      });
    }

    console.log(
      `[check-download] available [${provider}]: ${url}`
    );

    return res.status(200).json({
      available:
        true,

      finalUrl:
        result.finalUrl,

      contentType:
        result.contentType
    });
  }
);

/*
|--------------------------------------------------------------------------
| POST /api/download
|--------------------------------------------------------------------------
*/

router.post(
  '/download',
  async (req, res) => {
    const {
      tracks
    } = req.body || {};

    if (
      !Array.isArray(tracks) ||
      tracks.length === 0
    ) {
      return res.status(400).json({
        error:
          'الرجاء إرسال قائمة tracks غير فارغة'
      });
    }

    if (
      tracks.length >
      MAX_TRACKS_PER_DOWNLOAD
    ) {
      return res.status(400).json({
        error:
          `الحد الأقصى هو ${MAX_TRACKS_PER_DOWNLOAD} ملفًا في العملية الواحدة`
      });
    }

    /*
     * Validate tracks.
     */

    const validTracks =
      [];

    for (
      const track of tracks
    ) {
      if (
        !track ||
        typeof track !== 'object'
      ) {
        continue;
      }

      if (
        !track.downloadUrl
      ) {
        console.warn(
          `[download] missing downloadUrl: ${track.title || 'unknown'}`
        );

        continue;
      }

      const provider =
        String(
          track.sourceProvider || ''
        );

      const allowed =
        await isAllowedRemoteUrl(
          track.downloadUrl,
          provider
        );

      if (!allowed) {
        console.warn(
          '[download] blocked URL:',
          track.downloadUrl
        );

        continue;
      }

      validTracks.push({
        ...track,

        sourceProvider:
          provider
      });
    }

    if (
      validTracks.length === 0
    ) {
      return res.status(400).json({
        error:
          'لا توجد ملفات قابلة للتنزيل من المصادر المدعومة'
      });
    }

    /*
     * ZIP response.
     */

    res.status(200);

    res.setHeader(
      'Content-Type',
      'application/zip'
    );

    res.setHeader(
      'Content-Disposition',
      'attachment; filename="music.zip"'
    );

    res.setHeader(
      'Cache-Control',
      'no-store'
    );

    const archive =
      archiver('zip', {
        zlib: {
          level: 6
        }
      });

    let archiveFailed =
      false;

    archive.on(
      'error',
      err => {
        archiveFailed =
          true;

        console.error(
          '[download] archive error:',
          err
        );

        if (
          !res.writableEnded
        ) {
          res.end();
        }
      }
    );

    archive.on(
      'warning',
      err => {
        console.warn(
          '[download] archive warning:',
          err.message
        );
      }
    );

    archive.pipe(res);

    const usedNames =
      new Set();

    let addedCount =
      0;

    /*
     * Download sequentially.
     */

    for (
      const track of validTracks
    ) {
      if (
        archiveFailed
      ) {
        break;
      }

      try {
        const response =
          await downloadAudio(
            track.downloadUrl,
            track.sourceProvider
          );

        const contentType =
          response.headers[
            'content-type'
          ] || '';

        /*
         * Verify audio.
         */

        if (
          !isDownloadableAudioResponse(
            contentType,
            track.downloadUrl
          )
        ) {
          console.warn(
            `[download] skipped non-audio "${track.title}" (${contentType})`
          );

          continue;
        }

        if (
          !response.data ||
          response.data.length === 0
        ) {
          console.warn(
            `[download] empty file skipped: ${track.title}`
          );

          continue;
        }

        if (
          response.data.length >
          MAX_FILE_SIZE
        ) {
          console.warn(
            `[download] file too large: ${track.title}`
          );

          continue;
        }

        /*
         * Determine extension.
         */

        const extension =
          extensionFromContentType(
            contentType
          ) ||
          (
            typeof track.extension ===
              'string' &&
            /^\.[a-z0-9]+$/i.test(
              track.extension
            )
              ? track.extension
              : '.bin'
          );

        const baseName =
          sanitizeFilename(
            track.title
          );

        const filename =
          createUniqueFilename(
            baseName,
            extension,
            usedNames
          );

        archive.append(
          Buffer.from(
            response.data
          ),
          {
            name:
              filename
          }
        );

        addedCount++;

        console.log(
          `[download] added: ${filename}`
        );

      } catch (err) {
        console.error(
          `[download] failed "${track.title}" [${track.sourceProvider}]:`,
          err.message
        );
      }
    }

    /*
     * No files.
     */

    if (
      archiveFailed
    ) {
      return;
    }

    if (
      addedCount === 0
    ) {
      console.warn(
        '[download] no audio files were added'
      );

      archive.abort();

      if (
        !res.writableEnded
      ) {
        res.end();
      }

      return;
    }

    /*
     * Finalize ZIP.
     */

    try {
      await archive.finalize();

    } catch (err) {
      console.error(
        '[download] finalize error:',
        err
      );

      if (
        !res.writableEnded
      ) {
        res.end();
      }
    }
  }
);

module.exports = router;
