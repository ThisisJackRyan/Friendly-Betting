import React from 'react';
import { useNavigate, useLocation} from 'react-router-dom';
import { getSignedInUserInfo, isUserSignedIn } from '../../../Config/base';
import {useState, useEffect} from 'react';
import {db} from '../../../Config/firebase-config';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';

const CreateOverUnder = () => {
    const navigate = useNavigate();
    const location = useLocation();
    
    const [bet, setBet] = useState('');
    const [line, setLine] = useState('');

    const isLocationNull = location.state === null;


    useEffect(() => {
        if(!isUserSignedIn()){
            // alert("You must be signed in to create a bet")
            // navigate(`/Friendly-Betting/Bet`)
        }
        if(isLocationNull === false){
            try{
                setBet(location.state.bets.bet)
                setLine(location.state.bets.line)
            }
            catch (e){
                console.error(e);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const updateBet = async () => {
        const betsDocRef = doc(db, "bets", location.state.betUrl.id);
        const betsDocSnap = await getDoc(betsDocRef);

            await updateDoc(doc(db,"OverUnderBets" , betsDocSnap.data().betID), {
                bet: bet,
                line: line,
            })
            navigate(`/Friendly-Betting/Bet/OverUnderBets/${location.state.betUrl.id}/`) 
    }
    const createBet = async (userInfo) => {
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
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const userInfo = getSignedInUserInfo();
            if(userInfo !== null) {
                if(isLocationNull){
                    createBet(userInfo)
                } else {
                    updateBet()
                }
            } else {
                alert("You must be signed in to create a bet")
            }
          } catch (e) {
            console.error(e);
          }
    }

    

  return (
    <div>
        <form onSubmit={handleSubmit} className='m-4'>
            <div className='flex justify-center items-center p-4 bg-spring-green-light m-4 rounded-md'>
                <span className='text-3xl'>Over / Under</span>     
            </div>
            <div className='flex flex-col gap-6 m-12 mt-24'>
                <div className=''>
                    <div>
                        Bet
                    </div>
                    <textarea 
                        name="" 
                        id=""  
                        rows="3"
                        className='border-blue-gray rounded-md w-full outline-none p-4 focus:border-black '
                        value={bet}
                        onChange={(e) => setBet(e.target.value)}
                        placeholder='How many roles will grandpa eat at the family dinner?'
                    ></textarea>
                </div>
                <div className=''>
                    <div>Line</div>
                    <div>
                        <input 
                            className='border-blue-gray rounded-md w-full outline-none p-2 focus:border-black' 
                            type="number"
                            step="0.5"
                            onChange={(e) => setLine(Number(e.target.value) || '')}
                            placeholder='13.5'
                            value={line}
                            />
                    </div>    
                </div>
                <div className='flex justify-center mt-6'>
                    <button className='betButton  rounded-md cursor-pointer ' type='submit'>{isLocationNull ? "Create Bet" : "Update Bet"}</button>
                </div>
            </div>
        </form>
    </div>
    // <div className='p-12'>
    //     <form onSubmit={handelSubmit}>
    //         <div className="blob mx-auto items-start mt-8">
    //             <div className="text-4xl betLabel">Over Under</div>
    //             <div className='m-4 w-full'>
    //                 <span className='text-2xl border-bottom'>
    //                     Bet
    //                 </span>
    //                 <div className='mt-4'>
    //                     <textarea 
    //                         className='bg-secondary-spring-green-light rounded-md BetTextArea p-4'
    //                         onChange={(e) => setBet(e.target.value)}
    //                         placeholder='How many roles will grandpa eat at the family dinner?'
    //                         value={bet}
    //                     >
    //                     </textarea>
    //                 </div>
    //             </div>
    //             <div className='m-4 w-full'>
    //                 <span>
    //                     Line
    //                 </span>
    //                 <div className='mt-4'>
    //                     <input 
    //                         className='bg-secondary-spring-green-light rounded-md subgroupsBetTextArea p-4 text-md'
    //                         type="number"
    //                         step="0.5"
    //                         onChange={(e) =>setLine(Number(e.target.value))}
    //                         placeholder='13.5'
    //                         value={line}
    //                     />
    //                 </div>
    //             </div>
    //             <button className='betButton box-shadow rounded-md cursor-pointer' type='submit'>{isLocationNull ? "Create Bet" : "Update Bet"}</button>
    //         </div>
    //     </form>
    // </div>
  );
};

export default CreateOverUnder;
