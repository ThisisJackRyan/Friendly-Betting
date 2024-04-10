import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getSignedInUserInfo, isUserSignedIn } from '../../../Config/base';
import {useState, useEffect} from 'react';
import {db} from '../../../Config/firebase-config';
import { addDoc, collection } from 'firebase/firestore';

const CreateOverUnder = () => {
    const navigate = useNavigate();
    
    const [bet, setBet] = useState('');
    const [line, setLine] = useState(0);

    useEffect(() => {
        if(!isUserSignedIn()){
            alert("You must be signed in to create a bet")
            navigate(`/Friendly-Betting/Bet`)
        }
    }, [])

    const handelSubmit = async (e) => {
        e.preventDefault();
        try {
            const userInfo = getSignedInUserInfo();
            if(userInfo !== null) {
                const betRef = await addDoc(collection(db, "OverUnderBets"), {
                    bet: bet,
                    line: line,
                })
                const betLocation = await addDoc(collection(db, "bets"), {
                    betID: betRef.id,
                    type: "Over Under",
                    bet: bet,
                    createdByID: userInfo["uid"],
                    createdByEmail: userInfo["email"],
                    under: 0,
                    over: 0,
                })
            navigate(`/Friendly-Betting/Bet/OverUnderBets/${betLocation.id}/`) 
            } else {
                alert("You must be signed in to create a bet")
            }
          } catch (e) {
            console.error(e);
          }
    }

    

  return (
    <div className='p-12'>
        <form onSubmit={handelSubmit}>
            <div className="blob mx-auto items-start mt-8">
                <div className="text-4xl betLabel">Over Under</div>
                <div className='m-4 w-full'>
                    <span className='text-2xl border-bottom'>
                        Bet
                    </span>
                    <div className='mt-4'>
                        <textarea 
                            className='bg-secondary-spring-green-light rounded-md BetTextArea p-4'
                            onChange={(e) => setBet(e.target.value)}
                            placeholder='How many roles will grandpa eat at the family dinner?'
                        >
                        </textarea>
                    </div>
                </div>
                <div className='m-4 w-full'>
                    <span>
                        Line
                    </span>
                    <div className='mt-4'>
                        <input 
                            className='bg-secondary-spring-green-light rounded-md subgroupsBetTextArea p-4 text-md'
                            type="number"
                            step="0.5"
                            onChange={(e) =>setLine(Number(e.target.value))}
                            placeholder='13.5'
                        />
                    </div>
                </div>
                <button className='betButton box-shadow rounded-md cursor-pointer' type='submit'>Create Bet</button>
            </div>
        </form>
    </div>
  );
};

export default CreateOverUnder;
