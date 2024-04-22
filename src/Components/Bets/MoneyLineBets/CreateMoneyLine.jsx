import React, { useState, useEffect} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';




import { db } from '../../../Config/firebase-config';
import { addDoc, doc, getDoc , updateDoc, collection } from 'firebase/firestore';

import  { getSignedInUserInfo, isUserSignedIn }  from '../../../Config/base';



const CreateMoneyLine = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [bet, setBet] = useState('');
    const [contestant1, setContestant1] = useState('');
    const [contestant2, setContestant2] = useState('');
    const [odds1, setOdds1] = useState('');
    const [odds2, setOdds2] = useState('');

    const [isLocationNull, setIsLocationNull] = useState(location.state === null);


    useEffect(() => {
        if(!isUserSignedIn()){
            alert("You must be signed in to create a bet")
            navigate(`/Friendly-Betting/Bet`)
        }
        if(isLocationNull == false){
            try{
                setBet(location.state.bets.bet)
                setContestant1(location.state.bets.contestant1)
                setContestant2(location.state.bets.contestant2)
                setOdds1(location.state.bets.contestant1Odds)
                setOdds2(location.state.bets.contestant2Odds)
            }
            catch (e){
                console.error(e);
            }
        }
    }, [])


    const updateBet = async () => {
        try {
            const betsDocRef = doc(db, "bets", location.state.betUrl.id);
            const betsDocSnap = await getDoc(betsDocRef);

            await updateDoc(doc(db,"MoneyLineBets" , betsDocSnap.data().betID), {
                bet: bet,
                contestant1: contestant1,
                contestant1Odds: odds1,
                contestant2: contestant2,
                contestant2Odds: odds2,
            })
            navigate(`/Friendly-Betting/Bet/MoneyLineBets/${location.state.betUrl.id}/`) 
        } catch (e) {
            console.error(e);
        }
    }

    const createBet = async (userInfo) => {
        try {
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

        } catch (e) {
            console.error(e);
        }
    }

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
        const userInfo = getSignedInUserInfo();
        if(userInfo !== null) {
            if(isLocationNull){
                createBet(userInfo);
            }
            else{
                updateBet();
            }
            
        } else {
           alert("You must be signed in to create a bet")
        }
    } catch (e) {
      console.error(e);
    }
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
                            value={bet}
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
                            value={odds1}
                            onChange={(e) => setOdds1(Number(e.target.value) || '')}
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
                            value={odds2}
                            onChange={(e) => setOdds2(Number(e.target.value) || '')}
                            className='bg-secondary-spring-green-light rounded-md p-2'
                            placeholder='-500'
                            
                        />
                    </div>
                </div>
                <button className='betButton box-shadow rounded-md cursor-pointer' type='submit'>Create Bet</button>
            </div>
        </form>
    </div>
  );
};

export default CreateMoneyLine;
