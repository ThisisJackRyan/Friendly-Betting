import React from 'react';
import css from './OverUnder.module.css';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';
import {useState} from 'react';
import {db} from '../../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';

const CreateOverUnder = () => {
    
    const [bet, setBet] = useState('');
    const [line, setLine] = useState(0);


    const [shareDisplay, setShareDisplay] = useState(false);
    
    const handleShare = () => {
        setShareDisplay((current) => !current);
    }

    const handelSubmit = async (e) => {
        e.preventDefault();
        handleShare();
        try {
            await addDoc(collection(db, "bets"), {
                type: "Over Under",
                bet: bet,
            })
        
            await addDoc(collection(db, "OverUnderBets"), {
                bet: bet,
                line: line,
            })
          } catch (e) {
            console.error(e);
          }
        console.log('Creating over under bet');
    }

  return (
    <div className='flex'>
        <div className={css.OverUnder}>
        <form onSubmit={handelSubmit}>
                <div className={`flex flex-col gap-4 pb-8 ${css.betContainer}`}>
                    Proposition:
                    <div className={css.bet}>
                        <textarea className={css.BetTextArea} type="text" onChange={(e) => {setBet(e.target.value)}}/>
                    </div>
                </div>
                <div>
                    <div className="flex items-center gap-4 m-2">
                        <span className={css.label}>Line:</span>
                        <input className="h-6 w-12" type="number" step="0.5" onChange={(e) =>{setLine(Number(e.target.value))}} />
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
