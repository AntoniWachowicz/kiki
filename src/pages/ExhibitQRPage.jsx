import React from 'react';
import { QRCodeSVG } from 'qrcode.react';

const ExhibitQRPage = () => {
  const captureUrl = `${window.location.origin}/current`;

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-12 print:p-8">
      <div className="flex flex-col items-center gap-8">
        <p className="text-black/30 text-xs uppercase tracking-[0.3em] font-mono print:hidden">
          Exhibition QR — print this page
        </p>

        <div className="flex flex-col items-center gap-6 border border-black/10 p-10 print:border-0 print:p-0">
          <QRCodeSVG
            value={captureUrl}
            size={280}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
          />
          <div className="text-center">
            <p className="text-black/70 text-sm font-light mb-1">
              Scan to save your image
            </p>
            <p className="text-black/25 text-[11px] font-mono">{captureUrl}</p>
          </div>
        </div>

        <button
          onClick={() => window.print()}
          className="px-6 py-2.5 border border-black/15 text-black/35 text-xs uppercase tracking-[0.2em] hover:border-black/35 hover:text-black/60 transition-colors duration-500 print:hidden"
        >
          Print
        </button>
      </div>
    </div>
  );
};

export default ExhibitQRPage;
