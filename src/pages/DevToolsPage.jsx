import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { analyzeImage } from '../imageAnalysis';
import { renderAudioToWav, downloadBlob } from '../audioExport';

const DevToolsPage = () => {
  const [status, setStatus] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const loadImageToCanvas = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas);
      };
      img.onerror = reject;
      img.src = src;
    });
  };

  const generateAudioForImage = async (imagePath, outputName) => {
    setStatus(`Loading ${imagePath}...`);
    const canvas = await loadImageToCanvas(imagePath);

    setStatus(`Analyzing ${imagePath}...`);
    const analysis = analyzeImage(canvas, 'brightness');

    setStatus(`Rendering audio for ${outputName}...`);
    const wavBlob = await renderAudioToWav(analysis, 5, 0.5);

    setStatus(`Downloading ${outputName}.wav...`);
    downloadBlob(wavBlob, `${outputName}.wav`);

    return analysis;
  };

  const generateAllAudio = async () => {
    setIsGenerating(true);
    try {
      const boubaAnalysis = await generateAudioForImage('/examples/bouba.jpg', 'bouba');
      console.log('Bouba analysis:', boubaAnalysis);

      const kikiAnalysis = await generateAudioForImage('/examples/kiki.jpg', 'kiki');
      console.log('Kiki analysis:', kikiAnalysis);

      setStatus('Done! Move the downloaded files to public/audio/');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
      console.error(error);
    }
    setIsGenerating(false);
  };

  const generateBouba = async () => {
    setIsGenerating(true);
    try {
      const analysis = await generateAudioForImage('/examples/bouba.jpg', 'bouba');
      console.log('Bouba analysis:', analysis);
      setStatus('Done! Move bouba.wav to public/audio/');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
    setIsGenerating(false);
  };

  const generateKiki = async () => {
    setIsGenerating(true);
    try {
      const analysis = await generateAudioForImage('/examples/kiki.jpg', 'kiki');
      console.log('Kiki analysis:', analysis);
      setStatus('Done! Move kiki.wav to public/audio/');
    } catch (error) {
      setStatus(`Error: ${error.message}`);
    }
    setIsGenerating(false);
  };

  return (
    <div className="min-h-screen bg-black p-16">
      <div className="max-w-2xl">
        <h1 className="text-white text-2xl font-bold mb-8">Dev Tools</h1>

        <div className="mb-8">
          <h2 className="text-white text-lg font-semibold mb-4">Audio Generation</h2>
          <p className="text-white/70 mb-4">
            Generate WAV files from the example images. After downloading, move the files to{' '}
            <code className="bg-white/10 px-2 py-1 rounded">public/audio/</code>
          </p>

          <div className="flex gap-4 mb-4">
            <button
              onClick={generateAllAudio}
              disabled={isGenerating}
              className="px-6 py-3 bg-white text-black font-semibold hover:bg-white/90 transition-colors disabled:opacity-50"
            >
              Generate All
            </button>
            <button
              onClick={generateBouba}
              disabled={isGenerating}
              className="px-6 py-3 bg-white/20 text-white font-semibold hover:bg-white/30 transition-colors disabled:opacity-50"
            >
              Generate Bouba
            </button>
            <button
              onClick={generateKiki}
              disabled={isGenerating}
              className="px-6 py-3 bg-white/20 text-white font-semibold hover:bg-white/30 transition-colors disabled:opacity-50"
            >
              Generate Kiki
            </button>
          </div>

          {status && (
            <p className="text-white/70 font-mono text-sm">{status}</p>
          )}
        </div>

        <div className="border-t border-white/20 pt-8">
          <Link to="/" className="text-white/70 hover:text-white transition-colors">
            &larr; Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default DevToolsPage;
