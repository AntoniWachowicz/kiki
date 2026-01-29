import React from 'react';
import { Link } from 'react-router-dom';
import NoiseAnimation from '../components/NoiseAnimation';

const HomePage = () => {
  return (
    <div className="min-h-screen bg-black flex">
      {/* Left half - Animation */}
      <div className="flex-1">
        <NoiseAnimation />
      </div>

      {/* Right half - Content */}
      <div className="flex-1 flex items-center justify-center">
        <div className="px-16">
          <h1 className="text-6xl font-bold text-white mb-4">KIBA</h1>
          <h2 className="text-2xl text-white/70 mb-8">are you ready to play?</h2>
          <p className="text-white/100 max-w-md mb-10 leading-relaxed">
            Kiki and Bouba are names chosen by scientists to describe two types of shapes. 
            Kiki is a sharp and hard object. Bouba is round and soft. This association is persistant among all human cultures. Human brain is hardwired to asign harsher and faster sounds with danger. Slower harmonious sounds remind us of safety. This up aims to mimic this human tendency.
          </p>
          <div className="max-w-md flex justify-end gap-4">
            <Link
              to="/showcase"
              className="inline-block px-8 py-3 border border-white text-white font-semibold hover:bg-white/10 transition-colors"
            >
              showcase
            </Link>
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

export default HomePage;
