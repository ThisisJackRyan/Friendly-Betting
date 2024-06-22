import React from 'react';
import { Link } from 'react-router-dom';

const Logo = () => {
    return (
        <div className="flex justify-center ">
            <Link className=" ease-in no-underline text-black" to="/Friendly-Betting/">
                <div className="p-4 pt-8 text-shadow flex justify-start items-center text-5xl">
                    <span className="font-sans font-thin">FR</span>
                    <span className="font-serif font-bold text-2xl">IE</span>
                    <span className="font-sans font-thin">NDLY &nbsp;</span>
                    <span>Bets</span>
                </div>
            </Link>
        </div>
    );
};

export default Logo;