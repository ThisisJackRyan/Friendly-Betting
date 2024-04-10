import React, { useState, useEffect} from 'react';
import { useNavigate } from 'react-router-dom';
import css from './MoneyLine.module.css';
import Players from '../Players/Players';
import { db } from '../../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';

import  { getSignedInUserInfo, isUserSignedIn }  from '../../../Config/base';
import Buttons from '../../Components/Buttons';

const CreateMoneyLine = () => {
    const navigate = useNavigate();

    const [bet, setBet] = useState('');
    const [contestant1, setContestant1] = useState('');
    const [contestant2, setContestant2] = useState('');


    const [odds1, setOdds1] = useState(0);
    const [odds2, setOdds2] = useState(0);




    // useEffect(() => {
    //     if(!isUserSignedIn()){
    //         alert("You must be signed in to create a bet")
    //         navigate(`/Friendly-Betting/Bet`)
    //     }
    // }, [])

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
            
            const betLocation = await addDoc(collection(db, "bets"), {
                betID: betRef.id,
                type: "Money Line",
                bet: bet,
                createdByID: userInfo["uid"],
                createdByEmail: userInfo["email"],


            })
            navigate(`/Friendly-Betting/Bet/MoneyLineBets/${betLocation.id}/`) 
        } else {
           alert("You must be signed in to create a bet")
        }
        
        
  
      
    } catch (e) {
      console.error(e);
    }
    // Logic to create the moneyline bet using the team and odds values
    console.log('Creating moneyline bet:');
  };

  return (
    <div className='p-12'>
        <form onSubmit={handleSubmit}>
            <div className='blob mx-auto items-start mt-8'>
            <div className="text-4xl betLabel">MoneyLine</div>
                <div className='m-4 w-full'>
                    <span className='text-2xl border-bottom'>
                        Bet
                    </span>
                    <div className='mt-4'>
                        <textarea 
                            className='bg-secondary-spring-green-light rounded-md BetTextArea p-4'
                            onChange={(e) => setBet(e.target.value)}
                            placeholder='Who will win Movie of the year?'
                        >
                        </textarea>
                    </div>
                </div>
                <div className='m-4 w-full'>
                    <span>
                        Contestant 1
                    </span>
                    <div className='mt-4'>
                        <textarea 
                            className='bg-secondary-spring-green-light rounded-md subgroupsBetTextArea p-4 text-md'
                            value={contestant1}
                            onChange={(e) => setContestant1(e.target.value)}
                            placeholder='Barbie'
                        >
                        </textarea>
                    </div>
                    <div className='pl-8'>
                        <span className='text-sm pr-2'>(+ or - odds)</span>
                        <input 
                            type="number"  
                            onChange={(e) => setOdds1(Number(e.target.value))}
                            className="bg-secondary-spring-green-light rounded-md p-2"
                            placeholder='+350'
                        />
                    </div>
                </div>
                <div className='m-4 w-full'>
                    <span>
                        Contestant 2
                    </span>
                    <div className='mt-4'>
                        <textarea 
                            className='bg-secondary-spring-green-light rounded-md subgroupsBetTextArea p-4 text-md'
                            value={contestant2}
                            onChange={(e) => setContestant2(e.target.value)}
                            placeholder='Oppenheimer'
                        >
                        </textarea>
                    </div>
                    <div className='pl-8'>
                        <span className='text-sm pr-2'>(+ or - odds)</span>
                        <input 
                            type="number"  
                            onChange={(e) => setOdds2(Number(e.target.value))}
                            className='bg-secondary-spring-green-light rounded-md p-2'
                            placeholder='-500'
                        />
                    </div>
                </div>
                <button className='betButton box-shadow rounded-md cursor-pointer' type='submit'>Create Bet</button>
            </div>
        </form>
    </div>


    // <div className='flex'>
    //     <div className='x2'>
    //         <form className={css.MoneyLine} onSubmit={handleSubmit}>
    //         <div className={`pb-8 ${css.betContainer}`}>
    //             Bet:
    //             <div className="pl-8">
    //                 <textarea className={css.betTextArea}type="text" name="" id="" onChange={(e) => setBet(e.target.value)} />
    //             </div>
    //         </div>
    //         <div className='flex'>
    //             <div className="flex flex-col my-4 mx-8">
    //                 <div><span className={css.label}>Contestant 1</span></div>
    //                 <input
    //                     type="text"
    //                     name=""
    //                     value={contestant1}
    //                     className={css.contestantInput}
    //                     onChange={(e) => setContestant1(e.target.value)}
                        
    //                 />
    //                 <div className={css.odds}>
    //                     <span>(+ or - odds)</span>
    //                     <input className="justify-center items-center" type="number" onChange={(e) => setOdds1(Number(e.target.value))}/>
    //                 </div>
    //             </div>
    //             <div className="flex flex-col my-4 mx-8">
    //                 <div><span className={css.label}>Contestant 2</span></div>
    //                 <input 
    //                     type="text"
    //                     name=""
    //                     value={contestant2}
    //                     className={css.contestantInput}
    //                     onChange={(e) => setContestant2(e.target.value)}
                        
    //                 /> 
    //                 <div className="flex justify-center items-center gap-2 p-2">
    //                     <span className={css.odds}>(+ or - odds)</span>
    //                     <input type="number"  onChange={(e) => setOdds2(Number(e.target.value))}/>
    //                 </div>
    //             </div>
    //         </div>
                
    //         <button type="submit">Create Bet</button>
    //         </form>
    //     </div>
    // </div>
  );
};

export default CreateMoneyLine;
