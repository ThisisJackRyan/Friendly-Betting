import React from 'react';
import css from './Prop.module.css';
import { useState } from 'react';
import PreSetBettingOptions from './PreSetBettingOptions';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';
import {db} from '../../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';

const CreateProp = () => {

    const [bet, setBet] = useState('');
    const [Options, setOptions] = useState([]);


    const [isChecked, setIsChecked] = useState(false);
    const [shareDisplay, setShareDisplay] = useState(false);

    const handlesSetOptions = (options) => {
        setOptions(options);
    }
    
    const handleShare = () => {
        setShareDisplay((current) => !current);
    }

    
    const handleCheckboxChange = (event) => {
        setIsChecked(event.target.checked);
    };

    const handelSubmit = async (e) => {   
        e.preventDefault();
        handleShare();
        try {
            await addDoc(collection(db, "bets"), {
                type: "Prop",
                bet: bet,
            })
        
            await addDoc(collection(db, "PropBets"), {
                bet: bet,
                options: Options,
            })
          } catch (e) {
            console.error(e);
          }
        console.log('Creating prop bet');
    }
  return (
    <div className='flex'>
        <div className={css.prop} >
            <form onSubmit={handelSubmit}>
                <div className={css.betContainer}>
                    Proposition:
                    <div className={css.bet}>
                        <textarea type="text" onChange={(e) => {setBet(e.target.value)}} />
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
                {isChecked ? <PreSetBettingOptions setOptions={handlesSetOptions} display={handleCheckboxChange}/> : null}
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
