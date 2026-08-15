import { useState, useEffect } from 'react';

/*
 * useLatestVersion -- live release version for the site chrome.
 *
 * The source of truth is the same manifest the desktop app's updater uses
 * (/api/update.json, written by the admin publish flow), so the version shown
 * in the header / footer / hero follows the published release automatically.
 * Until it loads (or if the fetch fails) it falls back to the last known
 * shipped version so the site never renders an empty string.
 */

const MANIFEST_URL = '/api/update.json';
const FALLBACK_VERSION = '0.25.1';

let _cached = null;
let _pending = null;

function fetchLatestVersion() {
  if (_cached) return Promise.resolve(_cached);
  if (_pending) return _pending;

  _pending = fetch(MANIFEST_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      return res.json();
    })
    .then((data) => {
      _cached = data?.latest_version || data?.version || FALLBACK_VERSION;
      _pending = null;
      return _cached;
    })
    .catch(() => {
      _cached = FALLBACK_VERSION;
      _pending = null;
      return _cached;
    });

  return _pending;
}

export default function useLatestVersion() {
  const [version, setVersion] = useState(_cached || FALLBACK_VERSION);

  useEffect(() => {
    let alive = true;
    fetchLatestVersion().then((v) => {
      if (alive) setVersion(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  return version;
}
