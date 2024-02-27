import React from 'react';
import ShareBet from '../Bets/Players/ShareBet';
import { useState } from 'react';
import css from './Components.module.css';

const ShareButton = () => {
  // Add your component logic here
  const [shareDisplay, setShareDisplay] = useState(false)

  const handleShare = () => {
    setShareDisplay((current) => !current);
}

  return (
        <div className='flex justify-center items-center'>
            <button className={css.ShareButton} onClick={handleShare}>Share</button>
            {shareDisplay ? <ShareBet display={handleShare} /> : null}
        </div>
       
    
  );
};

export default ShareButton;
