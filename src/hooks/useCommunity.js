import { useState, useEffect } from 'react';

/**
 * Community data hooks for the OPS ROOM website.
 *
 * Both endpoints are proxied same-origin through the website nginx
 * (`/api/community/...` -> admin-api), so relative URLs work in the
 * production build. Only public-visibility flights are returned by the server.
 */

const LIVE_URL = '/api/community/live';
const LEADERBOARD_URL = '/api/community/leaderboard';
const LIVE_POLL_SECONDS = 15;
const LEADERBOARD_POLL_SECONDS = 60;

/** Live "who's airborne now" feed (public-visibility community flights). */
export function useCommunityLive() {
  const [state, setState] = useState({ flights: [], loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(LIVE_URL)
        .then((res) => {
          if (!res.ok) throw new Error(`live ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (cancelled) return;
          setState({ flights: data.flights || [], loading: false, error: null });
        })
        .catch((err) => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, loading: false, error: err.message }));
        });
    };
    load();
    const timer = setInterval(load, LIVE_POLL_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}

/** Public leaderboard (week / month / alltime). */
export function useCommunityLeaderboard(period = 'alltime') {
  const [state, setState] = useState({ leaderboard: [], period, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`${LEADERBOARD_URL}?period=${encodeURIComponent(period)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`leaderboard ${res.status}`);
          return res.json();
        })
        .then((data) => {
          if (cancelled) return;
          setState({
            leaderboard: data.leaderboard || [],
            period: data.period || period,
            loading: false,
            error: null,
          });
        })
        .catch((err) => {
          if (cancelled) return;
          setState((prev) => ({ ...prev, loading: false, error: err.message }));
        });
    };
    load();
    const timer = setInterval(load, LEADERBOARD_POLL_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [period]);

  return state;
}
