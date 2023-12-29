import React from 'react';
import css from './OverUnder.module.css';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';
import {useState} from 'react';

const CreateOverUnder = () => {
  

    const [shareDisplay, setShareDisplay] = useState(false);
    
    const handleShare = () => {
        setShareDisplay((current) => !current);
    }

    const handelSubmit = (e) => {
        e.preventDefault();
        handleShare();
        console.log('Creating over under bet');
    }

  return (
    <div className='flex'>
        <div className={css.OverUnder}>
        <form onSubmit={handelSubmit}>
                <div className={css.betContainer}>
                    Proposition:
                    <div className={css.bet}>
                        <textarea type="text"  />
                    </div>
                </div>
                <div>
                    <div className={css.setting}>
                        <span className={css.label}>Line:</span>
                        <input className={css.input} type="number" />
                    </div>
                </div>
                <button type="submit">Create bet</button>
            </form>
        </div>

        <div className="x1">
            <Players />
        </div>
        <div>
            {shareDisplay ? <ShareBet display={handleShare} /> : null}
            
        </div>
        
    </div>
  );
};

export default CreateOverUnder;
