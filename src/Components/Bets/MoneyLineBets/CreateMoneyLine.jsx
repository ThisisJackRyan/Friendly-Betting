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

    const [favorite, setFavorite] = useState('');
    const [is1checked, setIs1Checked] = useState(false)
    const [is2checked, setIs2Checked] = useState(false)


    const changeFavorite = (who, isChecked) => {
        if(isChecked === true){
            if(who === '1'){
                setIs1Checked(true);
                setIs2Checked(false);
                setFavorite(contestant1);
            }
            else if(who === '2'){
                setIs1Checked(false);
                setIs2Checked(true);
                setFavorite(contestant2);
            }
        }
        else {
            setIs1Checked(false);
            setIs2Checked(false);
            setFavorite('');
        }
    }

    const isLocationNull = location.state === null;


    useEffect(() => {
        if(!isUserSignedIn()){
            // alert("You must be signed in to create a bet")
            // navigate(`/Friendly-Betting/Bet`)
        }
        if(isLocationNull === false){
            try{
                setBet(location.state.bets.bet)
                setContestant1(location.state.bets.contestant1)
                setContestant2(location.state.bets.contestant2)
                setFavorite(location.state.bets.favorite)
            }
            catch (e){
                console.error(e);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])


    const updateBet = async () => {
        try {
            const betsDocRef = doc(db, "bets", location.state.betUrl.id);
            const betsDocSnap = await getDoc(betsDocRef);

            await updateDoc(doc(db,"MoneyLineBets" , betsDocSnap.data().betID), {
                bet: bet,
                contestant1: contestant1,
                contestant2: contestant2,
                favorite: favorite,
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
                contestant2: contestant2,
                favorite: favorite,
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
    <div>
        <form onSubmit={handleSubmit} className='m-4'>
            <div className='flex justify-center items-center p-4 bg-spring-green-light m-4 rounded-md'>
                <span className='text-3xl'>MoneyLine</span>     
            </div>
            <div className='m-12 mt-8'>
                <div className='mb-6'>
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
                        placeholder='Who will win Movie of the year?'
                    ></textarea>
                </div>
                <div className='mb-6'>
                    <div>Contestant 1</div>
                    <div>
                        <input 
                            type="text" 
                            className='border-blue-gray rounded-md w-full outline-none p-2 focus:border-black' 
                            value={contestant1}
                            onChange={(e) => setContestant1(e.target.value)}
                            placeholder='Barbie'
                            />
                    </div>
                    <div className='flex mt-2'>
                        <input 
                            type="checkbox" 
                            className='w-6' 
                            onChange={() => changeFavorite('1', !is1checked)}
                            value={is1checked}
                            />
                        <span className='pl-2 text-gray-400'>Favorite</span>
                    </div>
                </div>
                <div>
                    <div>Contestant 2</div>
                    <div>
                        <input 
                            type="text" 
                            className='border-blue-gray rounded-md w-full outline-none p-2 focus:border-black' 
                            value={contestant2}
                            onChange={(e) => setContestant2(e.target.value)}
                            placeholder='Oppenheimer'
                        />
                    </div>
                    <div className='flex mt-2'>
                        <input 
                            type="checkbox" 
                            className='w-6' 
                            onChange={() => changeFavorite('2', !is2checked)}
                            value={is2checked}
                        />
                        <span className='pl-2 text-gray-400'>Favorite</span>
                    </div>
                </div>
                <div className='flex justify-center mt-6'>
                    <button className='betButton  rounded-md cursor-pointer ' type='submit'>{isLocationNull ? "Create Bet" : "Update Bet"}</button>
                </div>
            </div>
            
        </form>
    </div>
  );
};

export default CreateMoneyLine;
