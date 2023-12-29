import React from 'react';
import css from './Prop.module.css';
import { useState } from 'react';
import PreSetBettingOptions from './PreSetBettingOptions';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';

const CreateProp = () => {

    const [isChecked, setIsChecked] = useState(false);
    const [shareDisplay, setShareDisplay] = useState(false);
    
    const handleShare = () => {
        setShareDisplay((current) => !current);
    }

    
    const handleCheckboxChange = (event) => {
        setIsChecked(event.target.checked);
    };

    const handelSubmit = (e) => {   
        e.preventDefault();
        handleShare();
        console.log('Creating prop bet');
    }
  return (
    <div className='flex'>
        <div className={css.prop} >
            <form onSubmit={handelSubmit}>
                <div className={css.betContainer}>
                    Proposition:
                    <div className={css.bet}>
                        <textarea type="text" name="" id="" />
                    </div>
                </div>
                <div className={css.settings}>
                    <input type="checkbox" id="preSetBetting" checked={isChecked} onChange={handleCheckboxChange} />
                    <label htmlFor="preSetBetting">Pre Set Betting Options</label>
                </div>
                <button type="submit">Create bet</button>
            </form>
        </div>
            <div>
                {isChecked ? <PreSetBettingOptions display={handleCheckboxChange}/> : null}
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

export default CreateProp;
