import React from 'react';
import { useState, useEffect } from 'react';
import {db} from '../../Config/firebase-config';
import { collection, getDocs } from 'firebase/firestore';
import DisplayBet from './DisplayBet';
import { getSignedInUserInfo } from '../../Config/base';
import { useNavigate } from 'react-router-dom';


const DisplayAllBets = () => {
    const [bets, setBets] = useState([])
    const navigate = useNavigate()


    useEffect(() => {
      const getBets = async () => {
        try{
          const data = await getDocs(collection(db, "bets"));
          const filteredData = data.docs.map(doc => ({
            ...doc.data(), 
            id: doc.id,
          }));
          const user = getSignedInUserInfo();
          const cleanedData = user ? filteredData.filter(bet => bet.createdByID === user.uid) : [];
          setBets(cleanedData);
        } catch (e) {
          console.error(e);
        }
      }
      
      getBets();
    }, [])

  return (
    <div className='flex flex-col justify-center py-6'>

      {bets.length < 1 ? (
        <div>
          <h3>hmmm.... Looks Like you haven't created any bets yet 🤷‍♂️ </h3>
          <p> Create One!</p>

        </div>
      ) : (
        <div>
          {bets.map((bet, id) => (
            <DisplayBet key={id} bet={bet} />
          ))}
        </div>
      ) }
      <button
        type="button"
        className="mt-6 w-full rounded-md bg-blue-gray py-4 text-white box-shadow"
        onClick={() => navigate('/Friendly-Betting/MoneyLineBets')}
      >
          New bet
      </button>
    </div>
  );
}

export default DisplayAllBets;
