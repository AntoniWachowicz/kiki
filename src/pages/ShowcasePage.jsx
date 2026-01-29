import React from 'react';
import { Link } from 'react-router-dom';
import KikiUrchin from '../components/KikiUrchin';
import BoubaBlob from '../components/BoubaBlob';

const ShowcasePage = () => {
  return (
    <div className="min-h-screen bg-black p-16">
      <div className="flex gap-8">
        {/* Left side - 3D shapes */}
        <div className="flex gap-4">
          <div>
            <div className="w-96 h-96 bg-black">
              <BoubaBlob />
            </div>
            <p className="text-white text-center mt-3 font-semibold">Bouba</p>
          </div>
          <div>
            <div className="w-96 h-96 bg-black">
              <KikiUrchin />
            </div>
            <p className="text-white text-center mt-3 font-semibold">Kiki</p>
          </div>
        </div>

        {/* Right side - Text content */}
        <div className="max-w-xs">
          <p className="text-white leading-relaxed mb-16">
            These are examples of Bouba and Kiki shapes. The round, soft curves of Bouba
            contrast with the sharp, angular edges of Kiki. When translated to sound,
            Bouba produces smooth, harmonic tones while Kiki generates harsh, staccato rhythms.
          </p>
          <p className="text-white/70 mb-6">
            Experience the transformation yourself.
          </p>
          <div className="flex justify-end">
            <Link
              to="/app"
              className="inline-block px-8 py-3 bg-white text-black font-semibold hover:bg-white/90 transition-colors"
            >
              play
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShowcasePage;
