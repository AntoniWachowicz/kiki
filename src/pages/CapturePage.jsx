import React, { useEffect, useState } from 'react';

const CapturePage = () => {
  const [imageUrl, setImageUrl] = useState(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get('url');
    if (url) setImageUrl(url);
  }, []);

  // Auto-trigger download once the image URL is known
  useEffect(() => {
    if (!imageUrl || downloaded) return;
    setDownloaded(true);
    const link = document.createElement('a');
    link.href = `/api/image?url=${encodeURIComponent(imageUrl)}`;
    link.download = 'bouba-kiki.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageUrl, downloaded]);

  if (!imageUrl) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/30 text-xs uppercase tracking-[0.3em] font-mono mb-4">
            Bouba / Kiki
          </p>
          <p className="text-white/15 text-xs">No image available yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 gap-8">
      <p className="text-white/25 text-xs uppercase tracking-[0.3em] font-mono">
        Bouba / Kiki
      </p>

      <img
        src={imageUrl}
        alt="Exhibition capture"
        className="max-w-full max-h-[65vh] object-contain"
      />

      <div className="flex flex-col items-center gap-3">
        <a
          href={`/api/image?url=${encodeURIComponent(imageUrl)}`}
          download="bouba-kiki.jpg"
          className="px-6 py-3 border border-white/15 text-white/35 text-xs uppercase tracking-[0.2em] hover:text-white/65 hover:border-white/30 transition-colors duration-500 font-mono"
        >
          Save image
        </a>
        <p className="text-white/15 text-xs">
          Your download should start automatically.
        </p>
      </div>
    </div>
  );
};

export default CapturePage;
