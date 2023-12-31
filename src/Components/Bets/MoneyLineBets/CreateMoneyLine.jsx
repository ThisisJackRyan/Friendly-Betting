import React, { useState } from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';
import ShareBet from '../Players/ShareBet';
import {db} from '../../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';

const CreateMoneyLine = () => {
  const [bet, setBet] = useState('');
  const [contestant1, setContestant1] = useState('');
  const [contestant2, setContestant2] = useState('');

  
  const [odds1, setOdds1] = useState(0);
  const [odds2, setOdds2] = useState(0);




  const [shareDisplay, setShareDisplay] = useState(false);

  



  const handleShare = () => {
    setShareDisplay((current) => !current);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    handleShare();
    try {
      await addDoc(collection(db, "bets"), {
          type: "Money Line",
          bet: bet,
      })
  
      await addDoc(collection(db, "MoneyLineBets"), {
          bet: bet,
          contestant1: contestant1,
          contestant1Odds: odds1,
          contestant2: contestant2,
          contestant2Odds: odds2,
      })
    } catch (e) {
      console.error(e);
    }
    // Logic to create the moneyline bet using the team and odds values
    console.log('Creating moneyline bet:');
  };

  return (
    <div className='flex'>
        <div className='x2'>
            <form className={css.MoneyLine} onSubmit={handleSubmit}>
            <div className={css.betContainer}>
                Bet:
                <div className={css.bet}>
                    <textarea type="text" name="" id="" onChange={(e) => setBet(e.target.value)} />
                </div>
            </div>
            <div className='flex'>
                <div className={css.contestant}>
                    <div><span className={css.label}>Contestant 1</span></div>
                    <input
                        type="text"
                        name=""
                        value={contestant1}
                        className={css.contestantInput}
                        onChange={(e) => setContestant1(e.target.value)}
                        
                    />
                    <div className={css.odds}>
                        <span>(+ or - odds)</span>
                        <input type="number" onChange={(e) => setOdds1(Number(e.target.value))}/>
                    </div>
                </div>
                <div className={css.contestant}>
                    <div><span className={css.label}>Contestant 2</span></div>
                    <input 
                        type="text"
                        name=""
                        value={contestant2}
                        className={css.contestantInput}
                        onChange={(e) => setContestant2(e.target.value)}
                        
                    /> 
                    <div className={css.odds}>
                        <span>(+ or - odds)</span>
                        <input type="number"  onChange={(e) => setOdds2(Number(e.target.value))}/>
                    </div>
                </div>
            </div>
                
            <button type="submit">Create Bet</button>
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

export default CreateMoneyLine;
