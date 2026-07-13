import { useEffect, useRef, useState } from 'react';

/**
 * Loads the YouTube IFrame API once and creates a player inside the element
 * whose `id` is `containerId`. Returns player control helpers.
 */
export function useYouTubePlayer({ containerId = 'yt-player', isAdmin, onStateChange }) {
  const playerRef = useRef(null);
  const onStateChangeRef = useRef(onStateChange);
  const [isReady, setIsReady] = useState(false);

  // Keep callback ref fresh on every render
  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  });

  useEffect(() => {
    function initPlayer() {
      const container = document.getElementById(containerId);
      if (!container || playerRef.current) return;

      playerRef.current = new window.YT.Player(containerId, {
        height: '100%',
        width: '100%',
        playerVars: { playsinline: 1, controls: isAdmin ? 1 : 0, rel: 0 },
        events: {
          onReady: () => setIsReady(true),
          onStateChange: (e) => onStateChangeRef.current?.(e),
        },
      });
    }

    if (window.YT?.Player) {
      initPlayer();
      return;
    }

    // Load script if not present
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }

    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      initPlayer();
    };

    return () => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadVideo    = (id, start = 0) => playerRef.current?.loadVideoById(id, start);
  const play         = ()              => playerRef.current?.playVideo();
  const pause        = ()              => playerRef.current?.pauseVideo();
  const stop         = ()              => playerRef.current?.stopVideo();
  const seekTo       = (s)            => playerRef.current?.seekTo(s, true);
  const setVolume    = (v)            => playerRef.current?.setVolume(v);
  const getCurrentTime = ()           => playerRef.current?.getCurrentTime() ?? 0;
  const getDuration    = ()           => playerRef.current?.getDuration() ?? 0;
  const getVideoData   = ()           => playerRef.current?.getVideoData?.() ?? {};

  return {
    isReady,
    playerRef,
    loadVideo,
    play,
    pause,
    stop,
    seekTo,
    setVolume,
    getCurrentTime,
    getDuration,
    getVideoData,
  };
}
