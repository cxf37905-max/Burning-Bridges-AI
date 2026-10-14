export function VideoPlayerPlaceholder() {
  return (
    <div className="bb-video-player bb-video-player-loading" aria-busy="true">
      <video
        controls
        playsInline
        preload="none"
        style={{ width: '100%', height: '100%', margin: 0 }}
        aria-label="Loading your video"
      />
    </div>
  );
}
