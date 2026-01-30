import React from 'react';
import { Link } from 'react-router-dom';
import KikiUrchin from '../components/KikiUrchin';
import BoubaBlob from '../components/BoubaBlob';

const ShowcasePage = () => {
  return (
    <div className="min-h-screen bg-black p-8 lg:p-12 xl:p-16 flex items-center">
      <div className="w-full flex flex-col lg:flex-row gap-8 lg:gap-12">
        {/* Left side - 3D shapes */}
        <div className="w-full lg:w-2/3 2xl:w-1/2 flex gap-4 lg:gap-6">
          <div className="flex-1">
            <div className="w-full aspect-square bg-black">
              <BoubaBlob />
            </div>
            <p className="text-white text-center mt-4 text-xl lg:text-2xl font-semibold">Bouba</p>
          </div>
          <div className="flex-1">
            <div className="w-full aspect-square bg-black">
              <KikiUrchin />
            </div>
            <p className="text-white text-center mt-4 text-xl lg:text-2xl font-semibold">Kiki</p>
          </div>
        </div>

        {/* Right side - Text content */}
        <div className="flex-1 flex flex-col justify-center 2xl:items-center lg:max-w-md 2xl:max-w-none">
          <div className="2xl:max-w-md">
            <p className="text-white text-xl lg:text-2xl leading-relaxed mb-12 lg:mb-16">
              Here's <b>Bouba</b> and <b>Kiki</b>. Click on them to hear how images connected to them sound like.
            </p>
            <p className="text-white/70 text-lg lg:text-xl mb-8">
              Experience the transformation yourself.
            </p>
            <div className="flex lg:justify-end">
              <Link
                to="/app"
                className="inline-block px-10 py-4 text-lg lg:text-xl bg-white text-black font-semibold hover:bg-white/90 transition-colors"
              >
                play
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShowcasePage;
