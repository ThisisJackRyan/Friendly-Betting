import React, { useState } from 'react';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';
import { db } from '../../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';

import  { getSignedInUserInfo }  from '../../../Config/base';

const CreateMoneyLine = () => {
  const [bet, setBet] = useState('');
  const [contestant1, setContestant1] = useState('');
  const [contestant2, setContestant2] = useState('');

  
  const [odds1, setOdds1] = useState(0);
  const [odds2, setOdds2] = useState(0);






  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
        const userInfo = getSignedInUserInfo();
        if(userInfo !== null) {
            const betRef = await addDoc(collection(db, "MoneyLineBets"), {
                bet: bet,
                contestant1: contestant1,
                contestant1Odds: odds1,
                contestant2: contestant2,
                contestant2Odds: odds2,
            })
            
            await addDoc(collection(db, "bets"), {
                betID: betRef.id,
                type: "Money Line",
                bet: bet,
                createdByID: userInfo["uid"],
                createdByEmail: userInfo["email"],


            })
        } else {
           alert("You must be signed in to create a bet")
        }
        //I should navigate right her to the bet view page so that the share button will be there. 
  
      
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
            <div className={`pb-8 ${css.betContainer}`}>
                Bet:
                <div className="pl-8">
                    <textarea className={css.betTextArea}type="text" name="" id="" onChange={(e) => setBet(e.target.value)} />
                </div>
            </div>
            <div className='flex'>
                <div className="flex flex-col my-4 mx-8">
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
                        <input className="justify-center items-center" type="number" onChange={(e) => setOdds1(Number(e.target.value))}/>
                    </div>
                </div>
                <div className="flex flex-col my-4 mx-8">
                    <div><span className={css.label}>Contestant 2</span></div>
                    <input 
                        type="text"
                        name=""
                        value={contestant2}
                        className={css.contestantInput}
                        onChange={(e) => setContestant2(e.target.value)}
                        
                    /> 
                    <div className="flex justify-center items-center gap-2 p-2">
                        <span className={css.odds}>(+ or - odds)</span>
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
    </div>
  );
};

export default CreateMoneyLine;
